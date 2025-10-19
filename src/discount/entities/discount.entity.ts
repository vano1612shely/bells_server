import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'discount' })
export class DiscountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  count: number;

  @Column({ type: 'int' })
  discount: number;
}
