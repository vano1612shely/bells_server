import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceController } from './price.controller';
import { PriceService } from './price.service';
import { PriceEntity } from './entities/price.entity';
import { DiscountEntity } from '../discount/entities/discount.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PriceEntity, DiscountEntity])],
  controllers: [PriceController],
  providers: [PriceService],
  exports: [PriceService],
})
export class PriceModule {}
