import { IsOptional, IsString, Length } from 'class-validator';

export class FindPointsDto {
  @IsOptional()
  @IsString()
  @Length(2, 10)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @Length(3, 200)
  address?: string;

  @IsOptional()
  @IsString()
  country?: string = 'FR';
}
