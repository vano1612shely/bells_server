import { Controller, Get, Put, Body, Query } from '@nestjs/common';
import { PriceService } from './price.service';
import {
  UpdatePriceDto,
  CalculatePriceDto,
  PriceCalculationResponse,
} from './dto/price.dto';
import { PriceEntity } from './entities/price.entity';
import { Public } from '../auth/guards/public.decorator';

@Controller('price')
export class PriceController {
  constructor(private readonly priceService: PriceService) {}

  @Public()
  @Get()
  async getPrice(): Promise<PriceEntity> {
    return await this.priceService.getPrice();
  }

  @Put()
  async updatePrice(
    @Body() updatePriceDto: UpdatePriceDto,
  ): Promise<PriceEntity> {
    return await this.priceService.updatePrice(updatePriceDto);
  }

  @Public()
  @Get('calculate')
  async calculatePrice(
    @Query() calculatePriceDto: CalculatePriceDto,
  ): Promise<PriceCalculationResponse> {
    return await this.priceService.calculatePrice(calculatePriceDto.quantity);
  }
}
