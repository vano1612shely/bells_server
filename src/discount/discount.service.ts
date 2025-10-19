import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiscountEntity } from './entities/discount.entity';
import { CreateDiscountDto } from './dto/create-discount.dto';

@Injectable()
export class DiscountService {
  constructor(
    @InjectRepository(DiscountEntity)
    private discountEntityRepository: Repository<DiscountEntity>,
  ) {}

  createDiscount(data: CreateDiscountDto) {
    return this.discountEntityRepository.save(data);
  }

  getAll() {
    return this.discountEntityRepository.find();
  }

  getById(id: string) {
    return this.discountEntityRepository.findOneBy({
      id: id,
    });
  }

  delete(id: string) {
    return this.discountEntityRepository.delete(id);
  }
}
