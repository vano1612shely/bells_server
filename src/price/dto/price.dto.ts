import { IsNumber, IsPositive, Min } from 'class-validator';

export class UpdatePriceDto {
  @IsNumber()
  @IsPositive()
  price: number;
}

export class CalculatePriceDto {
  @IsNumber()
  @Min(1)
  quantity: number;
}

export class PriceCalculationResponse {
  quantity: number;
  basePrice: number;
  totalPrice: number;
  discount: number;
  discountPercent: number;
  totalPriceWithDiscount: number;
}
