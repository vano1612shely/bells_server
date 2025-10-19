import { IsNumber } from 'class-validator';

export class CreateDiscountDto {
  @IsNumber()
  count: number;

  @IsNumber()
  discount: number;
}
