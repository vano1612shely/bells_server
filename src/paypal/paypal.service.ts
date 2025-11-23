import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, type Observable } from 'rxjs';
import { PAYPAL_REDIS } from './paypal.constants';
import Redis from 'ioredis';
import { CreatePaypalOrderDto } from './dto/create-paypal-order.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Order } from '../order/entities/order.entity';
import { Repository } from 'typeorm';
import { OrderStatus } from '../order/enums/order-status.enum';
import type { AxiosResponse } from 'axios';
import { isUUID } from 'class-validator';
import { EmailService } from '../notifications/email.service';

type PaypalOrderResponse = {
  id: string;
  status: string;
  links?: Array<{ href: string; rel: string; method: string }>;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{ id: string; status: string }>;
    };
  }>;
};

@Injectable()
export class PaypalService {
  private readonly logger = new Logger(PaypalService.name);
  private readonly paypalBaseUrl: string;
  private readonly currency: string;
  private readonly returnUrl: string;
  private readonly cancelUrl: string;
  private readonly brandName: string;
  private redisReady = false;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject(PAYPAL_REDIS) private readonly redis: Redis,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly emailService: EmailService,
  ) {
    const mode = this.configService.get<string>('PAYPAL_MODE', 'sandbox');
    this.paypalBaseUrl =
      mode === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
    this.currency = this.configService.get<string>('PAYPAL_CURRENCY', 'EUR');
    this.returnUrl = this.configService.get<string>('PAYPAL_RETURN_URL', '');
    this.cancelUrl = this.configService.get<string>('PAYPAL_CANCEL_URL', '');
    this.brandName = this.configService.get<string>(
      'PAYPAL_BRAND_NAME',
      'Bells',
    );
  }

  async createOrder(dto: CreatePaypalOrderDto) {
    const order = await this.orderRepository.findOne({
      where: { id: dto.orderId },
      relations: ['items', 'delivery'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === OrderStatus.PAID) {
      throw new BadRequestException('Order is already paid');
    }

    const accessToken = await this.getAccessToken();
    const totalAmount = this.getOrderAmount(order);

    const payload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: order.id,
          amount: {
            currency_code: this.currency,
            value: totalAmount,
          },
        },
      ],
      application_context: {
        return_url: this.returnUrl,
        cancel_url: this.cancelUrl,
        brand_name: this.brandName,
      },
    };

    const response = await this.requestWithRetry<PaypalOrderResponse>(() =>
      this.httpService.post<PaypalOrderResponse>(
        `${this.paypalBaseUrl}/v2/checkout/orders`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const createdOrder = response.data;
    order.paypalOrderId = createdOrder.id;
    await this.orderRepository.save(order);
    this.logger.log(
      `PayPal order ${createdOrder.id} created for order ${order.id}`,
    );

    return {
      paypalOrderId: createdOrder.id,
      status: createdOrder.status,
      links: createdOrder.links ?? [],
    };
  }

  async capturePayment(paypalOrderId: string) {
    const where = isUUID(paypalOrderId)
      ? [{ paypalOrderId }, { id: paypalOrderId }]
      : [{ paypalOrderId }];

    const order = await this.orderRepository.findOne({
      where,
    });

    if (!order) {
      throw new NotFoundException('Order not found for provided identifier');
    }

    if (!order.paypalOrderId) {
      throw new BadRequestException('Order does not have a PayPal session');
    }

    if (order.status === OrderStatus.PAID) {
      return {
        status: 'COMPLETED',
        orderId: order.id,
        paypalOrderId: order.paypalOrderId,
      };
    }

    const accessToken = await this.getAccessToken();

    const response = await this.requestWithRetry<PaypalOrderResponse>(() =>
      this.httpService.post<PaypalOrderResponse>(
        `${this.paypalBaseUrl}/v2/checkout/orders/${order.paypalOrderId}/capture`,
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const capture = response.data;
    const captureId =
      capture.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;
    const isCompleted =
      capture.status === 'COMPLETED' ||
      capture.purchase_units?.some((unit) =>
        unit.payments?.captures?.some((c) => c.status === 'COMPLETED'),
      );

    if (!isCompleted) {
      throw new BadRequestException('Payment not completed on PayPal side');
    }

    order.status = OrderStatus.PAID;
    order.paidAt = new Date();
    order.paypalCaptureId = captureId;
    await this.orderRepository.save(order);

    void this.emailService.sendOrderConfirmation(order);

    this.logger.log(
      `Payment captured for order ${order.id} (PayPal ${order.paypalOrderId})`,
    );

    return {
      status: capture.status,
      orderId: order.id,
      paypalOrderId: order.paypalOrderId,
      captureId,
    };
  }

  private async getAccessToken(): Promise<string> {
    await this.ensureRedisConnection();
    const cacheKey = 'access_token';
    const cachedToken = await this.redis.get(cacheKey);
    if (cachedToken) return cachedToken;

    const clientId = this.configService.get<string>('PAYPAL_CLIENT_ID');
    const clientSecret = this.configService.get<string>('PAYPAL_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException('PayPal credentials are missing');
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await this.requestWithRetry<{
      access_token: string;
      expires_in: number;
    }>(() =>
      this.httpService.post<{
        access_token: string;
        expires_in: number;
      }>(
        `${this.paypalBaseUrl}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      ),
    );

    const { access_token, expires_in } = response.data;
    const ttl = Math.max(60, (expires_in ?? 0) - 60);

    await this.redis.set(cacheKey, access_token, 'EX', ttl);
    this.logger.debug(`Cached PayPal access token for ${ttl} seconds`);
    return access_token;
  }

  private getOrderAmount(order: Order): string {
    const amount =
      Number(order.totalPriceWithDiscount ?? order.totalPrice) ||
      Number(order.totalPrice);

    if (!amount || amount <= 0) {
      throw new BadRequestException('Invalid order total amount');
    }

    return amount.toFixed(2);
  }

  private async ensureRedisConnection() {
    if (this.redisReady || this.redis.status === 'ready') {
      this.redisReady = true;
      return;
    }

    try {
      await this.redis.connect();
      this.redisReady = true;
      this.logger.log('Connected to Redis for PayPal token caching');
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error as Error);
      throw new InternalServerErrorException('Redis connection failed');
    }
  }

  private async requestWithRetry<T>(
    request: () => Observable<AxiosResponse<T>>,
    attempt = 0,
  ): Promise<AxiosResponse<T>> {
    const maxAttempts = 3;
    const backoff = 300 * Math.pow(2, attempt);

    try {
      const response = await firstValueFrom(request());
      return response;
    } catch (error) {
      if (attempt >= maxAttempts - 1) {
        this.logger.error('PayPal API request failed', error as Error);
        throw new BadRequestException('PayPal API request failed');
      }

      await new Promise((resolve) => setTimeout(resolve, backoff));
      this.logger.warn(
        `Retrying PayPal API request (attempt ${attempt + 2}/${maxAttempts})`,
      );
      return this.requestWithRetry<T>(request, attempt + 1);
    }
  }
}
