import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceEntity } from './entities/price.entity';
import { DiscountEntity } from '../discount/entities/discount.entity'; // Adjust path as needed
import { PriceCalculationResponse, UpdatePriceDto } from './dto/price.dto';

@Injectable()
export class PriceService {
  constructor(
    @InjectRepository(PriceEntity)
    private priceRepository: Repository<PriceEntity>,
    @InjectRepository(DiscountEntity)
    private discountRepository: Repository<DiscountEntity>,
  ) {}

  async getPrice(): Promise<PriceEntity> {
    let price = await this.priceRepository.findOne({ where: {} });

    if (!price) {
      price = this.priceRepository.create({ price: 0 });
      await this.priceRepository.save(price);
    }

    return price;
  }

  async updatePrice(updatePriceDto: UpdatePriceDto): Promise<PriceEntity> {
    let price = await this.priceRepository.findOne({ where: {} });

    if (!price) {
      price = this.priceRepository.create(updatePriceDto);
    } else {
      price.price = updatePriceDto.price;
    }

    return await this.priceRepository.save(price);
  }

  async calculatePrice(quantity: number): Promise<PriceCalculationResponse> {
    const price = await this.getPrice();
    const basePrice = Number(price.price);
    const totalPrice = basePrice * quantity;

    // Отримуємо всі знижки, відсортовані за кількістю товарів
    const discounts = await this.discountRepository.find({
      order: { count: 'DESC' },
    });

    // Знаходимо найбільшу знижку, де кількість товарів <= переданій кількості
    const applicableDiscount = discounts.find((d) => quantity >= d.count);

    let discountPercent = 0;
    if (applicableDiscount) {
      discountPercent = Number(applicableDiscount.discount);
    }

    const discount = (totalPrice * discountPercent) / 100;
    const totalPriceWithDiscount = totalPrice - discount;

    return {
      quantity,
      basePrice,
      totalPrice,
      discount,
      discountPercent,
      totalPriceWithDiscount,
    };
  }
}
