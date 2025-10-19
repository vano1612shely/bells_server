import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { DiscountService } from './discount.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { Public } from '../auth/guards/public.decorator';

@Controller('discount')
export class DiscountController {
  constructor(private readonly discountService: DiscountService) {}

  @Post()
  createDiscount(@Body() body: CreateDiscountDto) {
    return this.discountService.createDiscount(body);
  }

  @Public()
  @Get()
  getDiscount() {
    return this.discountService.getAll();
  }

  @Public()
  @Get(':id')
  getDiscountById(@Param('id') id: string) {
    return this.discountService.getById(id);
  }

  @Delete(':id')
  deleteDiscount(@Param('id') id: string) {
    return this.discountService.delete(id);
  }
}
