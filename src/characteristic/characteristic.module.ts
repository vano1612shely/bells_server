import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharacteristicCategory } from './entities/characteristic-category.entity';
import { CharacteristicOption } from './entities/characteristic.entity';
import { CharacteristicsService } from './characteristic.service';
import { CategoriesController } from './characteristic.controller';
import { OptionsController } from './option.contoller';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CharacteristicCategory, CharacteristicOption]),
    FilesModule,
  ],
  providers: [CharacteristicsService],
  controllers: [CategoriesController, OptionsController],
  exports: [CharacteristicsService],
})
export class CharacteristicsModule {}
