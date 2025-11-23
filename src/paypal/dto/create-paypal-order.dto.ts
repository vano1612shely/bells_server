import { IsUUID } from 'class-validator';

export class CreatePaypalOrderDto {
  @IsUUID()
  orderId: string;
}
