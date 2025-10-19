// src/characteristics/characteristics.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CharacteristicCategory } from './entities/characteristic-category.entity';
import { CharacteristicOption } from './entities/characteristic.entity';
import { CreateOptionDto, UpdateOptionDto } from './dto/create-option.dto';

@Injectable()
export class CharacteristicsService {
  constructor(
    @InjectRepository(CharacteristicCategory)
    private categoriesRepo: Repository<CharacteristicCategory>,
    @InjectRepository(CharacteristicOption)
    private optionsRepo: Repository<CharacteristicOption>,
  ) {}

  // Categories
  createCategory(payload: Partial<CharacteristicCategory>) {
    const ent = this.categoriesRepo.create(payload);
    return this.categoriesRepo.save(ent);
  }

  findAllCategories() {
    return this.categoriesRepo.find({
      relations: ['options'],
      order: { createdAt: 'DESC' },
    });
  }

  async findCategoryById(id: string) {
    const c = await this.categoriesRepo.findOne({
      where: { id },
      relations: ['options'],
    });
    if (!c) throw new NotFoundException('Category not found');
    return c;
  }

  async updateCategory(id: string, payload: Partial<CharacteristicCategory>) {
    const c = await this.findCategoryById(id);
    Object.assign(c, payload);
    return this.categoriesRepo.save(c);
  }

  async removeCategory(id: string) {
    await this.categoriesRepo.delete(id);
  }

  // Options
  async createOption(categoryId: string, dto: CreateOptionDto) {
    const category = await this.categoriesRepo.findOneBy({ id: categoryId });
    if (!category) throw new NotFoundException('Category not found');

    const ent = this.optionsRepo.create({ ...dto, categoryId });
    return this.optionsRepo.save(ent);
  }

  async findOptionsOfCategory(categoryId: string) {
    return this.optionsRepo.find({
      where: { categoryId },
    });
  }

  async findOptionById(id: string) {
    const o = await this.optionsRepo.findOneBy({ id });
    if (!o) throw new NotFoundException('Option not found');
    return o;
  }

  async updateOption(id: string, dto: UpdateOptionDto) {
    const o = await this.findOptionById(id);
    Object.assign(o, dto);
    return this.optionsRepo.save(o);
  }

  async removeOption(id: string) {
    await this.optionsRepo.delete(id);
  }

  // API: all characteristics
  getAllCharacteristics() {
    return this.categoriesRepo.find({
      relations: ['options'],
      order: { title: 'ASC' },
    });
  }
}
