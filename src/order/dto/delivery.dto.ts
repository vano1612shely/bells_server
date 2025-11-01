import { IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class RelayPointDto {
  @IsOptional()
  id?: number;

  @IsString()
  Num: string;

  @IsString()
  LgAdr1: string;

  @IsOptional()
  @IsString()
  LgAdr2?: string;

  @IsOptional()
  @IsString()
  LgAdr3?: string;

  @IsOptional()
  @IsString()
  LgAdr4?: string;

  @IsString()
  CP: string;

  @IsString()
  Ville: string;

  @IsString()
  Pays: string;

  @IsOptional()
  lat?: number;

  @IsOptional()
  lon?: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  cp?: number | string;

  @IsOptional()
  @IsString()
  city?: string;
}

export class DeliveryAddressDto {
  @IsString()
  name: string;

  @IsString()
  street: string;

  @IsOptional()
  @IsString()
  additional?: string;

  @IsString()
  postalCode: string;

  @IsString()
  city: string;

  @IsString()
  phone: string;
}

export class RelayDeliveryDto {
  @IsString()
  phone: string;

  @IsOptional()
  @Transform(({ value }) => {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return value;
    }
  })
  @ValidateNested()
  @Type(() => RelayPointDto)
  point?: RelayPointDto;
}

export class DeliveryDto {
  @IsEnum(['home', 'relay'])
  type: 'home' | 'relay';

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  address?: DeliveryAddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RelayDeliveryDto)
  relay?: RelayDeliveryDto;
}
