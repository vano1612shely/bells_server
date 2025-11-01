import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { PriceModule } from '../price/price.module';
import { FilesModule } from '../files/files.module';
import { Delivery } from './entities/delivery.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Delivery]),
    PriceModule,
    FilesModule,
  ],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
