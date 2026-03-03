import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Location } from './location.entity';
import { Booking } from '../booking/booking.entity';

@Entity('location_departments')
export class LocationDepartment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Location, (location) => location.departments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'locationId' })
  location: Location;

  @Column()
  locationId: string;

  @Column()
  department: string;

  @Column({ type: 'int' })
  capacity: number;

  @Column()
  openDays: string;

  @Column({ type: 'time', nullable: true })
  openStart: string | null;

  @Column({ type: 'time', nullable: true })
  openEnd: string | null;

  @OneToMany(() => Booking, (booking) => booking.locationDepartment)
  bookings: Booking[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
