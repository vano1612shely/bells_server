// src/characteristics/categories.controller.ts
import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseInterceptors,
  UploadedFiles,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { makeMulterStorage, pathRelativeToUploads } from '../files/multer.util';
import { FilesService } from '../files/files.service';
import { CharacteristicsService } from './characteristic.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Public } from '../auth/guards/public.decorator';
@Controller('categories')
export class CategoriesController {
  constructor(
    private cs: CharacteristicsService,
    private filesService: FilesService,
  ) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'icon', maxCount: 1 }], {
      storage: makeMulterStorage('categories'),
    }),
  )
  createCategory(
    @UploadedFiles() files: { icon?: Express.Multer.File[] },
    @Body() body: CreateCategoryDto,
  ) {
    if (files?.icon?.[0]) {
      const f = files.icon[0];
      // можна взяти f.filename або отримати відносний через pathRelativeToUploads(f.path)
      const rel = pathRelativeToUploads((f as any).path);
      body.iconUrl = this.filesService.buildFileUrl(rel);
    }
    return this.cs.createCategory(body as any);
  }
  @Public()
  @Get()
  getAll() {
    return this.cs.findAllCategories();
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.cs.findCategoryById(id);
  }

  @Put(':id')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'icon', maxCount: 1 }], {
      storage: makeMulterStorage('categories'),
    }),
  )
  async updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: { icon?: Express.Multer.File[] },
    @Body() body: UpdateCategoryDto,
  ) {
    const toUpdate: any = { ...body };
    if (files?.icon?.[0]) {
      const f = files.icon[0];
      const rel = pathRelativeToUploads((f as any).path);
      toUpdate.iconUrl = this.filesService.buildFileUrl(rel);

      // видалити стару іконку якщо була
      const cat = await this.cs.findCategoryById(id);
      if (cat.iconUrl) {
        await this.filesService.removeFile(
          cat.iconUrl.replace('/uploads/', ''),
        );
      }
    }
    return this.cs.updateCategory(id, toUpdate);
  }

  @Delete(':id')
  async deleteCategory(@Param('id', ParseUUIDPipe) id: string) {
    const cat = await this.cs.findCategoryById(id);
    if (!cat) throw new NotFoundException();
    if (cat.iconUrl)
      await this.filesService.removeFile(cat.iconUrl.replace('/uploads/', ''));
    if (cat.options && cat.options.length) {
      for (const o of cat.options) {
        if (o.smallImageUrl)
          await this.filesService.removeFile(
            o.smallImageUrl.replace('/uploads/', ''),
          );
        if (o.largeImageUrl)
          await this.filesService.removeFile(
            o.largeImageUrl.replace('/uploads/', ''),
          );
      }
    }
    await this.cs.removeCategory(id);
    return { success: true };
  }
}
