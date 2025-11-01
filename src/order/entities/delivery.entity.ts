import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('deliveries')
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ['home', 'relay'] })
  type: 'home' | 'relay';

  // Доставка додому
  @Column({ nullable: true })
  name?: string;

  @Column({ nullable: true })
  street?: string;

  @Column({ nullable: true })
  additional?: string;

  @Column({ nullable: true })
  postalCode?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  phone?: string;

  // Пункт relais
  @Column({ nullable: true })
  relayPhone?: string;

  @Column({ type: 'jsonb', nullable: true })
  relayPoint?: {
    id?: number;
    Num: string;
    LgAdr1: string;
    LgAdr2?: string;
    LgAdr3?: string;
    LgAdr4?: string;
    CP: string;
    Ville: string;
    Pays: string;
    lat?: number;
    lon?: number;
    name?: string;
    address?: string;
    cp?: number | string;
    city?: string;
  } | null;
}
