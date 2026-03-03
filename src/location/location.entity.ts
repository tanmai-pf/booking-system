import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Tree,
  TreeChildren,
  TreeParent,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LocationDepartment } from './location-department.entity';

@Entity('locations')
@Tree('closure-table')
export class Location {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  code: string;

  @Column({ default: false })
  bookable: boolean;

  @TreeParent({ onDelete: 'CASCADE' })
  parent: Location;

  @TreeChildren()
  children: Location[];

  @OneToMany(() => LocationDepartment, (ld) => ld.location, {
    cascade: true,
    eager: false,
  })
  departments: LocationDepartment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
