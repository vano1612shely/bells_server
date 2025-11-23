import { Body, Controller, Param, Post, ValidationPipe } from '@nestjs/common';
import { PaypalService } from './paypal.service';
import { CreatePaypalOrderDto } from './dto/create-paypal-order.dto';
import { Public } from '../auth/guards/public.decorator';

@Controller('payments')
export class PaypalController {
  constructor(private readonly paypalService: PaypalService) {}

  @Public()
  @Post('create-order')
  async createOrder(
    @Body(new ValidationPipe({ whitelist: true }))
    dto: CreatePaypalOrderDto,
  ) {
    return this.paypalService.createOrder(dto);
  }

  @Public()
  @Post('capture/:orderId')
  async capturePayment(@Param('orderId') orderId: string) {
    return this.paypalService.capturePayment(orderId);
  }
}
