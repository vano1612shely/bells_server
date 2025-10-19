import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { OrderService } from './order.service';
import {
  CreateOrderDto,
  OrderQueryDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';
import { Order } from './entities/order.entity';
import { Public } from '../auth/guards/public.decorator';
import { makeMulterStorage } from '../files/multer.util';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Public()
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'originImage', maxCount: 50 },
        { name: 'image', maxCount: 50 },
      ],
      {
        storage: makeMulterStorage('orders'),
      },
    ),
  )
  async create(
    @Body() createOrderDto: CreateOrderDto,
    @UploadedFiles()
    files: {
      originImage?: Express.Multer.File[];
      image?: Express.Multer.File[];
    },
  ): Promise<Order> {
    return await this.orderService.create(createOrderDto, files);
  }

  @Get()
  async findAll(@Query() query: OrderQueryDto) {
    return await this.orderService.findAll(query);
  }

  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Order> {
    return await this.orderService.findOne(id);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateOrderStatusDto,
  ): Promise<Order> {
    return await this.orderService.updateStatus(id, updateStatusDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    await this.orderService.remove(id);
    return { message: 'Замовлення успішно видалено' };
  }
}
