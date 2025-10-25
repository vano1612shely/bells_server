import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BackTemplate } from './entities/back-template.entity';
import {
  CreateBackTemplateDto,
  UpdateBackTemplateDto,
} from './dto/back-template.dto';
import { FilesService } from '../files/files.service';
import { pathRelativeToUploads } from '../files/multer.util';
import * as fs from 'fs/promises';

@Injectable()
export class BackTemplateService {
  constructor(
    @InjectRepository(BackTemplate)
    private backTemplateRepository: Repository<BackTemplate>,
    private filesService: FilesService,
  ) {}

  async create(
    createDto: CreateBackTemplateDto,
    files: {
      image?: Express.Multer.File;
      thumbnail?: Express.Multer.File;
    },
  ): Promise<BackTemplate> {
    const template = this.backTemplateRepository.create({
      title: createDto.title,
      description: createDto.description,
    });

    if (files.image) {
      const imagePath = pathRelativeToUploads(files.image.path);
      template.imagePath = this.filesService.buildFileUrl(imagePath);
    }

    if (files.thumbnail) {
      const thumbnailPath = pathRelativeToUploads(files.thumbnail.path);
      template.thumbnailPath = this.filesService.buildFileUrl(thumbnailPath);
    }

    return await this.backTemplateRepository.save(template);
  }

  async findAll(): Promise<BackTemplate[]> {
    return await this.backTemplateRepository.find();
  }

  async findOne(id: string): Promise<BackTemplate> {
    const template = await this.backTemplateRepository.findOne({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException(`Шаблон з ID ${id} не знайдено`);
    }

    return template;
  }

  async update(
    id: string,
    updateDto: UpdateBackTemplateDto,
    files?: {
      image?: Express.Multer.File;
      thumbnail?: Express.Multer.File;
    },
  ): Promise<BackTemplate> {
    const template = await this.findOne(id);

    if (updateDto.title) template.title = updateDto.title;
    if (updateDto.description !== undefined)
      template.description = updateDto.description;

    if (files?.image) {
      // Видалити старе зображення
      if (template.imagePath) {
        try {
          await fs.unlink(template.imagePath);
        } catch (error) {
          console.error('Помилка видалення старого файлу:', error);
        }
      }
      const imagePath = pathRelativeToUploads(files.image.path);
      template.imagePath = this.filesService.buildFileUrl(imagePath);
    }

    if (files?.thumbnail) {
      if (template.thumbnailPath) {
        try {
          await fs.unlink(template.thumbnailPath);
        } catch (error) {
          console.error('Помилка видалення старого файлу:', error);
        }
      }
      const thumbnailPath = pathRelativeToUploads(files.thumbnail.path);
      template.thumbnailPath = this.filesService.buildFileUrl(thumbnailPath);
    }

    return await this.backTemplateRepository.save(template);
  }

  async remove(id: string): Promise<void> {
    const template = await this.findOne(id);

    if (template.imagePath) {
      try {
        await fs.unlink(template.imagePath);
      } catch (error) {
        console.error('Помилка видалення файлу:', error);
      }
    }

    if (template.thumbnailPath) {
      try {
        await fs.unlink(template.thumbnailPath);
      } catch (error) {
        console.error('Помилка видалення файлу:', error);
      }
    }

    await this.backTemplateRepository.remove(template);
  }
}
