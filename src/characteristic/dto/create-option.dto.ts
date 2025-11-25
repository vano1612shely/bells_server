import { IsString, IsOptional, IsInt, IsObject } from 'class-validator';
import { Transform } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class CreateOptionDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  smallImageUrl?: string;

  @IsOptional()
  @IsString()
  largeImageUrl?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    if (!value) return undefined;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  })
  @IsObject()
  metadata?: any;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateOptionDto extends PartialType(CreateOptionDto) {}
