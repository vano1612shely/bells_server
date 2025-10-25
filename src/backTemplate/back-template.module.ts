import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BackTemplate } from './entities/back-template.entity';
import { BackTemplateService } from './back-template.service';
import { BackTemplateController } from './back-template.controller';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [TypeOrmModule.forFeature([BackTemplate]), FilesModule],
  controllers: [BackTemplateController],
  providers: [BackTemplateService],
  exports: [BackTemplateService],
})
export class BackTemplateModule {}
