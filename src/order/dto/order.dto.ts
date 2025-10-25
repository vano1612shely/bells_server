import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '../enums/order-status.enum';

export enum BackSideType {
  TEMPLATE = 'template',
  CUSTOM = 'custom',
}

export class CreateOrderItemDto {
  @IsNumber()
  @Min(1)
  quantity: number;

  @IsObject()
  characteristics: Record<string, string>;

  // Front side files
  originImage?: any;
  image?: any;

  // Back side configuration
  @IsEnum(BackSideType)
  @IsOptional()
  backSideType?: BackSideType;

  @IsString()
  @IsOptional()
  backTemplateId?: string;

  // Back side files (якщо backSideType = CUSTOM)
  backOriginImage?: any;
  backImage?: any;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;
}

export class OrderQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 10;
}
