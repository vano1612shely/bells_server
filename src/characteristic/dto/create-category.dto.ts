import { IsString, IsOptional } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  iconUrl?: string; // if using already uploaded file URL
}
