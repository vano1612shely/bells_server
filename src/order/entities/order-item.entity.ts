import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';

export enum BackSideType {
  TEMPLATE = 'template',
  CUSTOM = 'custom',
}

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('int')
  quantity: number;

  @Column({ type: 'jsonb', nullable: true })
  characteristics: Record<string, string>;

  // Front side (передня частина)
  @Column({ nullable: true })
  originImagePath: string;

  @Column({ nullable: true })
  imagePath: string;

  @Column({
    type: 'enum',
    enum: BackSideType,
    default: BackSideType.TEMPLATE,
  })
  backSideType: BackSideType;

  // Якщо backSideType = TEMPLATE
  @Column({ type: 'uuid', nullable: true })
  backTemplateId: string | null;

  @Column({ nullable: true })
  backOriginImagePath: string;

  @Column({ nullable: true })
  backImagePath: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column()
  orderId: string;
}
