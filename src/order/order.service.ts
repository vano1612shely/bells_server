import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Not, Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem, BackSideType } from './entities/order-item.entity';
import { Delivery } from './entities/delivery.entity';
import {
  CreateOrderDto,
  OrderQueryDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';
import { PriceService } from '../price/price.service';
import { OrderStatus } from './enums/order-status.enum';
import { pathRelativeToUploads } from '../files/multer.util';
import { FilesService } from '../files/files.service';
import { EmailService } from '../notifications/email.service';

@Injectable()
export class OrderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderService.name);
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,

    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,

    @InjectRepository(Delivery)
    private deliveryRepository: Repository<Delivery>,

    private priceService: PriceService,
    private filesService: FilesService,
    private emailService: EmailService,
  ) {}

  async onModuleInit() {
    await this.runCleanupSafely();

    const oneHour = 60 * 60 * 1000;
    this.cleanupInterval = setInterval(() => {
      void this.runCleanupSafely();
    }, oneHour);
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  async create(
    createOrderDto: CreateOrderDto,
    files: {
      originImage?: Express.Multer.File[];
      image?: Express.Multer.File[];
      backOriginImage?: Express.Multer.File[];
      backImage?: Express.Multer.File[];
    },
  ): Promise<Order> {
    const totalQuantity = createOrderDto.items.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );

    const priceCalculation =
      await this.priceService.calculatePrice(totalQuantity);

    const delivery = new Delivery();
    delivery.type = createOrderDto.delivery.type;
    if (delivery.type === 'home' && createOrderDto.delivery.address) {
      const addr = createOrderDto.delivery.address;
      delivery.name = addr.name;
      delivery.street = addr.street;
      delivery.additional = addr.additional;
      delivery.postalCode = addr.postalCode;
      delivery.city = addr.city;
      delivery.phone = addr.phone;
    } else if (delivery.type === 'relay' && createOrderDto.delivery.relay) {
      const relay = createOrderDto.delivery.relay;
      delivery.relayPhone = relay.phone;
      if (relay.point) {
        delivery.relayPoint =
          typeof relay.point === 'string'
            ? JSON.parse(relay.point)
            : relay.point;
      } else {
        delivery.relayPoint = null;
      }
    }

    await this.deliveryRepository.save(delivery);

    const order = this.orderRepository.create({
      name: createOrderDto.name,
      email: createOrderDto.email,
      status: OrderStatus.CREATED,
      pricePerUnit: priceCalculation.basePrice,
      totalPrice: priceCalculation.totalPrice,
      discount: priceCalculation.discount,
      totalPriceWithDiscount: priceCalculation.totalPriceWithDiscount,
      totalQuantity,
      delivery,
    });

    const savedOrder = await this.orderRepository.save(order);

    const orderItems: OrderItem[] = [];

    for (let i = 0; i < createOrderDto.items.length; i++) {
      const itemDto = createOrderDto.items[i];
      const orderItem = new OrderItem();

      orderItem.quantity = Number(itemDto.quantity);

      if (typeof itemDto.characteristics === 'string') {
        try {
          orderItem.characteristics = JSON.parse(itemDto.characteristics);
        } catch {
          orderItem.characteristics = {};
        }
      } else {
        orderItem.characteristics = itemDto.characteristics;
      }

      orderItem.orderId = savedOrder.id;

      if (files.originImage?.[i]) {
        const originImagePath = pathRelativeToUploads(
          files.originImage[i].path,
        );
        orderItem.originImagePath =
          this.filesService.buildFileUrl(originImagePath);
      }
      if (files.image?.[i]) {
        const imagePath = pathRelativeToUploads(files.image[i].path);
        orderItem.imagePath = this.filesService.buildFileUrl(imagePath);
      }

      const backSideType = itemDto.backSideType || BackSideType.TEMPLATE;
      orderItem.backSideType = backSideType;

      if (backSideType === BackSideType.TEMPLATE) {
        orderItem.backTemplateId = itemDto.backTemplateId || null;
      } else {
        if (files.backOriginImage?.[i]) {
          const backOriginImagePath = pathRelativeToUploads(
            files.backOriginImage[i].path,
          );
          orderItem.backOriginImagePath =
            this.filesService.buildFileUrl(backOriginImagePath);
        }
        if (files.backImage?.[i]) {
          const backImagePath = pathRelativeToUploads(files.backImage[i].path);
          orderItem.backImagePath =
            this.filesService.buildFileUrl(backImagePath);
        }
      }

      orderItems.push(orderItem);
    }

    await this.orderItemRepository.save(orderItems);

    return this.findOne(savedOrder.id);
  }

  async findAll(
    query: OrderQueryDto,
  ): Promise<{ data: Order[]; total: number; page: number; limit: number }> {
    const { status, email, page = 1, limit = 10 } = query;

    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('order.delivery', 'delivery')
      .orderBy('order.createdAt', 'DESC');

    if (status) queryBuilder.andWhere('order.status = :status', { status });
    if (email)
      queryBuilder.andWhere('order.email LIKE :email', { email: `%${email}%` });

    const [data, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }
  async findOne(id: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['items', 'delivery'],
    });

    if (!order) {
      throw new NotFoundException(
        `La commande avec l’ID ${id} est introuvable.`,
      );
    }

    return order;
  }

  async updateStatus(
    id: string,
    updateStatusDto: UpdateOrderStatusDto,
  ): Promise<Order> {
    const order = await this.findOne(id);
    order.status = updateStatusDto.status;
    if (order.status === OrderStatus.PAID) {
      void this.emailService.sendOrderConfirmation(order);
    }
    await this.orderRepository.save(order);
    return this.findOne(id);
  }
  async remove(id: string): Promise<void> {
    const order = await this.findOne(id);

    await this.removeOrderFiles(order);
    await this.orderRepository.remove(order);
  }

  private async runCleanupSafely() {
    try {
      await this.removeExpiredUnpaidOrders();
    } catch (error) {
      this.logger.error(
        'Failed to remove expired unpaid orders',
        error as Error,
      );
    }
  }

  private async removeExpiredUnpaidOrders(): Promise<void> {
    const deadline = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleOrders = await this.orderRepository.find({
      where: {
        status: Not(OrderStatus.PAID),
        paidAt: IsNull(),
        createdAt: LessThan(deadline),
      },
      relations: ['items', 'delivery'],
    });

    if (!staleOrders.length) return;

    for (const order of staleOrders) {
      await this.removeOrderFiles(order);
    }

    await this.orderRepository.remove(staleOrders);
    this.logger.log(
      `Removed ${staleOrders.length} unpaid orders older than 24 hours`,
    );
  }

  private async removeOrderFiles(order: Order): Promise<void> {
    for (const item of order.items) {
      const filesToDelete = [
        item.originImagePath,
        item.imagePath,
        item.backOriginImagePath,
        item.backImagePath,
      ];

      for (const filePath of filesToDelete) {
        const relativePath = this.toUploadsRelativePath(filePath);
        if (!relativePath) continue;

        await this.filesService.removeFile(relativePath);
      }
    }
  }

  private toUploadsRelativePath(filePath?: string | null): string | null {
    if (!filePath) return null;

    let normalized = filePath.replace(/\\/g, '/');

    try {
      const url = new URL(normalized);
      normalized = url.pathname;
    } catch {
      // not an absolute URL, keep as-is
    }

    const uploadsPrefix = '/uploads/';
    const plainPrefix = 'uploads/';

    if (normalized.startsWith(uploadsPrefix)) {
      return normalized.slice(uploadsPrefix.length);
    }

    if (normalized.startsWith(plainPrefix)) {
      return normalized.slice(plainPrefix.length);
    }

    return normalized.replace(/^\/+/, '');
  }
}
