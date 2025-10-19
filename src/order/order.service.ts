import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import {
  CreateOrderDto,
  OrderQueryDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';
import { PriceService } from '../price/price.service';
import { OrderStatus } from './enums/order-status.enum';
import * as fs from 'fs/promises';
import { pathRelativeToUploads } from '../files/multer.util';
import { FilesService } from '../files/files.service';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    private priceService: PriceService,
    private filesService: FilesService,
  ) {}

  async create(
    createOrderDto: CreateOrderDto,
    files: {
      originImage?: Express.Multer.File[];
      image?: Express.Multer.File[];
    },
  ): Promise<Order> {
    // Розраховуємо загальну кількість товарів
    const totalQuantity = createOrderDto.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    // Отримуємо розрахунок ціни зі знижкою
    const priceCalculation =
      await this.priceService.calculatePrice(totalQuantity);

    // Створюємо замовлення
    const order = this.orderRepository.create({
      name: createOrderDto.name,
      phone: createOrderDto.phone,
      status: OrderStatus.CREATED,
      pricePerUnit: priceCalculation.basePrice,
      totalPrice: priceCalculation.totalPrice,
      discount: priceCalculation.discount,
      totalPriceWithDiscount: priceCalculation.totalPriceWithDiscount,
      totalQuantity,
    });

    const savedOrder = await this.orderRepository.save(order);

    // Створюємо items
    const orderItems: OrderItem[] = [];

    for (let i = 0; i < createOrderDto.items.length; i++) {
      const itemDto = createOrderDto.items[i];

      const orderItem = new OrderItem();
      orderItem.quantity = itemDto.quantity;
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
        const originImagePath = pathRelativeToUploads(files.image[i].path);
        orderItem.imagePath = this.filesService.buildFileUrl(originImagePath);
      }

      orderItems.push(orderItem);
    }

    await this.orderItemRepository.save(orderItems);

    return this.findOne(savedOrder.id);
  }

  async findAll(
    query: OrderQueryDto,
  ): Promise<{ data: Order[]; total: number; page: number; limit: number }> {
    const { status, phone, page = 1, limit = 10 } = query;

    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .orderBy('order.createdAt', 'DESC');

    if (status) {
      queryBuilder.andWhere('order.status = :status', { status });
    }

    if (phone) {
      queryBuilder.andWhere('order.phone LIKE :phone', { phone: `%${phone}%` });
    }

    const [data, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!order) {
      throw new NotFoundException(`Замовлення з ID ${id} не знайдено`);
    }

    return order;
  }

  async updateStatus(
    id: string,
    updateStatusDto: UpdateOrderStatusDto,
  ): Promise<Order> {
    const order = await this.findOne(id);

    order.status = updateStatusDto.status;
    await this.orderRepository.save(order);

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const order = await this.findOne(id);

    // Видаляємо файли фото
    for (const item of order.items) {
      if (item.originImagePath) {
        try {
          await fs.unlink(item.originImagePath);
        } catch (error) {
          console.error(
            `Помилка видалення файлу: ${item.originImagePath}`,
            error,
          );
        }
      }
      if (item.imagePath) {
        try {
          await fs.unlink(item.imagePath);
        } catch (error) {
          console.error(`Помилка видалення файлу: ${item.imagePath}`, error);
        }
      }
    }

    await this.orderRepository.remove(order);
  }
}
