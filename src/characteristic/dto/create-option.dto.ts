import { IsString, IsOptional, IsInt, IsObject } from 'class-validator';
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
  @IsObject()
  metadata?: any;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateOptionDto extends PartialType(CreateOptionDto) {}
