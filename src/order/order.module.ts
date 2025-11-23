import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { PriceModule } from '../price/price.module';
import { FilesModule } from '../files/files.module';
import { Delivery } from './entities/delivery.entity';
import { EmailService } from '../notifications/email.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Delivery]),
    PriceModule,
    FilesModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, EmailService],
  exports: [OrderService],
})
export class OrderModule {}
