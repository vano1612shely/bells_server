import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { CharacteristicOption } from './characteristic.entity';

@Entity({ name: 'characteristic_categories' })
export class CharacteristicCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  iconUrl?: string;

  @OneToMany(() => CharacteristicOption, (o) => o.category, { cascade: true })
  options?: CharacteristicOption[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
