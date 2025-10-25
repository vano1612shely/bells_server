import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { BackTemplateService } from './back-template.service';
import {
  CreateBackTemplateDto,
  UpdateBackTemplateDto,
} from './dto/back-template.dto';
import { BackTemplate } from './entities/back-template.entity';
import { Public } from '../auth/guards/public.decorator';
import { makeMulterStorage } from '../files/multer.util';

@Controller('back-templates')
export class BackTemplateController {
  constructor(private readonly backTemplateService: BackTemplateService) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'image', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
      ],
      {
        storage: makeMulterStorage('back-templates'),
      },
    ),
  )
  async create(
    @Body() createDto: CreateBackTemplateDto,
    @UploadedFiles()
    files: {
      image?: Express.Multer.File[];
      thumbnail?: Express.Multer.File[];
    },
  ): Promise<BackTemplate> {
    return await this.backTemplateService.create(createDto, {
      image: files.image?.[0],
      thumbnail: files.thumbnail?.[0],
    });
  }

  @Public()
  @Get()
  async findAll(): Promise<BackTemplate[]> {
    return await this.backTemplateService.findAll();
  }

  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<BackTemplate> {
    return await this.backTemplateService.findOne(id);
  }

  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'image', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
      ],
      {
        storage: makeMulterStorage('back-templates'),
      },
    ),
  )
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateBackTemplateDto,
    @UploadedFiles()
    files?: {
      image?: Express.Multer.File[];
      thumbnail?: Express.Multer.File[];
    },
  ): Promise<BackTemplate> {
    return await this.backTemplateService.update(id, updateDto, {
      image: files?.image?.[0],
      thumbnail: files?.thumbnail?.[0],
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    await this.backTemplateService.remove(id);
    return { message: 'Шаблон успішно видалено' };
  }
}
