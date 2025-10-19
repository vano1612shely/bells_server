// src/characteristics/options.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { makeMulterStorage, pathRelativeToUploads } from '../files/multer.util';
import { CharacteristicsService } from './characteristic.service';
import { FilesService } from '../files/files.service';
import { CreateOptionDto, UpdateOptionDto } from './dto/create-option.dto';

@Controller()
export class OptionsController {
  constructor(
    private cs: CharacteristicsService,
    private filesService: FilesService,
  ) {}

  @Post('categories/:categoryId/options')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'small', maxCount: 1 },
        { name: 'large', maxCount: 1 },
      ],
      { storage: makeMulterStorage('options') },
    ),
  )
  async createOption(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @UploadedFiles()
    files: { small?: Express.Multer.File[]; large?: Express.Multer.File[] },
    @Body() body: CreateOptionDto,
  ) {
    if (files?.small?.[0]) {
      const rel = pathRelativeToUploads((files.small[0] as any).path);
      body.smallImageUrl = this.filesService.buildFileUrl(rel);
    }
    if (files?.large?.[0]) {
      const rel = pathRelativeToUploads((files.large[0] as any).path);
      body.largeImageUrl = this.filesService.buildFileUrl(rel);
    }
    return this.cs.createOption(categoryId, body as any);
  }

  @Get('categories/:categoryId/options')
  getCategoryOptions(@Param('categoryId', ParseUUIDPipe) categoryId: string) {
    return this.cs.findOptionsOfCategory(categoryId);
  }

  @Get('options/:id')
  getOption(@Param('id', ParseUUIDPipe) id: string) {
    return this.cs.findOptionById(id);
  }

  @Put('options/:id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'small', maxCount: 1 },
        { name: 'large', maxCount: 1 },
      ],
      { storage: makeMulterStorage('options') },
    ),
  )
  async updateOption(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles()
    files: { small?: Express.Multer.File[]; large?: Express.Multer.File[] },
    @Body() body: UpdateOptionDto,
  ) {
    const toUpdate: any = { ...body };
    const existing = await this.cs.findOptionById(id);

    if (files?.small?.[0]) {
      const rel = pathRelativeToUploads((files.small[0] as any).path);
      toUpdate.smallImageUrl = this.filesService.buildFileUrl(rel);
      if (existing.smallImageUrl)
        await this.filesService.removeFile(
          existing.smallImageUrl.replace('/uploads/', ''),
        );
    }
    if (files?.large?.[0]) {
      const rel = pathRelativeToUploads((files.large[0] as any).path);
      toUpdate.largeImageUrl = this.filesService.buildFileUrl(rel);
      if (existing.largeImageUrl)
        await this.filesService.removeFile(
          existing.largeImageUrl.replace('/uploads/', ''),
        );
    }

    return this.cs.updateOption(id, toUpdate);
  }

  @Delete('options/:id')
  async deleteOption(@Param('id', ParseUUIDPipe) id: string) {
    const existing = await this.cs.findOptionById(id);
    if (existing.smallImageUrl)
      await this.filesService.removeFile(
        existing.smallImageUrl.replace('/uploads/', ''),
      );
    if (existing.largeImageUrl)
      await this.filesService.removeFile(
        existing.largeImageUrl.replace('/uploads/', ''),
      );
    await this.cs.removeOption(id);
    return { success: true };
  }
}
