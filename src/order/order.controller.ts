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
import { AnyFilesInterceptor } from '@nestjs/platform-express';
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
    AnyFilesInterceptor({ storage: makeMulterStorage('orders') }),
  )
  async create(
    @Body() createOrderDto: CreateOrderDto,
    @UploadedFiles() uploadedFiles: Express.Multer.File[],
  ): Promise<Order> {
    // Групуємо файли за ключами типу "originImage[0]"
    const filesMap = uploadedFiles.reduce(
      (acc, file) => {
        const match = file.fieldname.match(/^(\w+)\[(\d+)\]$/);
        if (match) {
          const [, key, indexStr] = match;
          const index = Number(indexStr);
          if (!acc[key]) acc[key] = [];
          acc[key][index] = file;
        }
        return acc;
      },
      {} as Record<string, Express.Multer.File[]>,
    );
    return await this.orderService.create(createOrderDto, {
      originImage: filesMap['originImage'],
      image: filesMap['image'],
      backOriginImage: filesMap['backOriginImage'],
      backImage: filesMap['backImage'],
    });
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

  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string) {
    return await this.orderService.generateOrderPdfBase64(id);
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
