import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CharacteristicCategory } from './characteristic-category.entity';

@Entity({ name: 'characteristic_options' })
export class CharacteristicOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  smallImageUrl?: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  largeImageUrl?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: any; // наприклад { colorHex: '#fff' } - опціонально

  @ManyToOne(() => CharacteristicCategory, (c) => c.options, {
    onDelete: 'CASCADE',
  })
  category: CharacteristicCategory;

  @Column()
  categoryId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
