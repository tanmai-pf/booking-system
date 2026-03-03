import {
  Injectable,
  NotFoundException,
  BadRequestException,

  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking, BookingStatus } from './booking.entity';
import { Location } from '../location/location.entity';
import { LocationDepartment } from '../location/location-department.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { JwtUser } from '../common/guards/auth.guard';

const DAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(LocationDepartment)
    private readonly locationDeptRepo: Repository<LocationDepartment>,
  ) {}

  async create(dto: CreateBookingDto, user: JwtUser): Promise<Booking> {
    this.logger.log(
      `Creating booking for location ${dto.locationId} by ${user.name}`,
    );

    const location = await this.locationRepo.findOne({
      where: { id: dto.locationId },
    });
    if (!location) {
      throw new NotFoundException(
        `Location with id "${dto.locationId}" not found`,
      );
    }
    if (!location.bookable) {
      throw new BadRequestException(
        `Location "${location.name}" is not bookable`,
      );
    }

    const allocation = await this.locationDeptRepo.findOne({
      where: { locationId: dto.locationId, department: dto.department },
    });
    if (!allocation) {
      throw new BadRequestException(
        `Department "${dto.department}" is not allocated to this location`,
      );
    }

    if (dto.attendees > allocation.capacity) {
      throw new BadRequestException(
        `Number of attendees (${dto.attendees}) exceeds room capacity (${allocation.capacity})`,
      );
    }

    // 4. Validate time
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    if (startTime <= new Date()) {
      throw new BadRequestException('Cannot book in the past');
    }

    if (endTime <= startTime) {
      throw new BadRequestException('End time must be after start time');
    }

    const duplicate = await this.bookingRepo.findOne({
      where: {
        locationDeptId: allocation.id,
        bookedBy: user.sub,
        startTime,
        status: BookingStatus.CONFIRMED,
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'You already have a booking for this department at the same start time',
      );
    }

    this.validateSchedule(allocation, startTime, endTime);

    await this.checkOverlap(
      dto.locationId,
      startTime,
      endTime,
    );

    const booking = this.bookingRepo.create({
      locationDeptId: allocation.id,
      attendees: dto.attendees,
      startTime,
      endTime,
      bookedBy: user.sub,
      status: BookingStatus.CONFIRMED,
    });

    return this.bookingRepo.save(booking);
  }

  async findAll(filters?: {
    locationId?: string;
    department?: string;
    date?: string;
    status?: BookingStatus;
    bookedBy?: string;
  }): Promise<Booking[]> {
    const qb = this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.locationDepartment', 'ld')
      .leftJoinAndSelect('ld.location', 'location');

    if (filters?.locationId) {
      qb.andWhere('ld.locationId = :locationId', {
        locationId: filters.locationId,
      });
    }
    if (filters?.department) {
      qb.andWhere('ld.department = :department', {
        department: filters.department,
      });
    }
    if (filters?.date) {
      qb.andWhere('DATE(booking.startTime) = :date', { date: filters.date });
    }
    if (filters?.status) {
      qb.andWhere('booking.status = :status', { status: filters.status });
    }
    if (filters?.bookedBy) {
      qb.andWhere('booking.bookedBy = :bookedBy', {
        bookedBy: filters.bookedBy,
      });
    }

    qb.orderBy('booking.startTime', 'ASC');
    return qb.getMany();
  }

  async findOne(id: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: ['locationDepartment', 'locationDepartment.location'],
    });
    if (!booking) {
      throw new NotFoundException(`Booking with id "${id}" not found`);
    }
    return booking;
  }

  async update(id: string, dto: UpdateBookingDto): Promise<Booking> {
    this.logger.log(`Updating booking: ${id}`);
    const booking = await this.findOne(id);

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Cannot update a cancelled booking');
    }

    const allocation = await this.locationDeptRepo.findOne({
      where: { id: booking.locationDeptId },
    });
    if (!allocation) {
      throw new NotFoundException('Department allocation no longer exists');
    }

    const startTime = dto.startTime
      ? new Date(dto.startTime)
      : booking.startTime;
    const endTime = dto.endTime ? new Date(dto.endTime) : booking.endTime;
    const attendees = dto.attendees ?? booking.attendees;

    if (startTime <= new Date()) {
      throw new BadRequestException('Cannot book in the past');
    }

    if (endTime <= startTime) {
      throw new BadRequestException('End time must be after start time');
    }

    if (attendees > allocation.capacity) {
      throw new BadRequestException(
        `Number of attendees (${attendees}) exceeds room capacity (${allocation.capacity})`,
      );
    }

    this.validateSchedule(allocation, startTime, endTime);
    await this.checkOverlap(
      allocation.locationId,
      startTime,
      endTime,
      id,
    );

    booking.startTime = startTime;
    booking.endTime = endTime;
    booking.attendees = attendees;

    return this.bookingRepo.save(booking);
  }

  async cancel(id: string): Promise<Booking> {
    this.logger.log(`Cancelling booking: ${id}`);
    const booking = await this.findOne(id);

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }

    booking.status = BookingStatus.CANCELLED;
    return this.bookingRepo.save(booking);
  }

  // --- Private validation helpers ---

  private validateSchedule(
    allocation: LocationDepartment,
    startTime: Date,
    endTime: Date,
  ): void {
    if (allocation.openDays.toLowerCase() === 'always') {
      return;
    }

    const dayRange = this.parseDayRange(allocation.openDays);
    const bookingDay = startTime.getUTCDay();
    const endDay = endTime.getUTCDay();

    if (!dayRange.includes(bookingDay)) {
      throw new BadRequestException(
        `Room is not open on ${this.getDayName(bookingDay)}. Open days: ${allocation.openDays}`,
      );
    }

    if (!dayRange.includes(endDay) && endDay !== bookingDay) {
      throw new BadRequestException(
        `Booking end falls on ${this.getDayName(endDay)}, which is outside open days: ${allocation.openDays}`,
      );
    }

    if (allocation.openStart && allocation.openEnd) {
      const startMinutes = this.toMinutes(startTime);
      const endMinutes = this.toMinutes(endTime);
      const openStartMinutes = this.parseTimeToMinutes(allocation.openStart);
      const openEndMinutes = this.parseTimeToMinutes(allocation.openEnd);

      if (startMinutes < openStartMinutes || startMinutes >= openEndMinutes) {
        throw new BadRequestException(
          `Booking start time is outside operating hours (${allocation.openStart} - ${allocation.openEnd})`,
        );
      }

      if (endMinutes > openEndMinutes || endMinutes <= openStartMinutes) {
        throw new BadRequestException(
          `Booking end time is outside operating hours (${allocation.openStart} - ${allocation.openEnd})`,
        );
      }
    }
  }

  private parseDayRange(openDays: string): number[] {
    const normalized = openDays.replace(/\s+/g, '');
    const match = normalized.match(/^(\w{3})-(\w{3})$/);
    if (!match) {
      throw new BadRequestException(
        `Cannot parse day range: "${openDays}". Expected format: "Mon-Fri"`,
      );
    }

    const startDay = DAY_MAP[match[1]];
    const endDay = DAY_MAP[match[2]];

    if (startDay === undefined || endDay === undefined) {
      throw new BadRequestException(`Invalid day names in: "${openDays}"`);
    }

    const days: number[] = [];
    let current = startDay;
    while (true) {
      days.push(current);
      if (current === endDay) break;
      current = (current + 1) % 7;
    }
    return days;
  }

  private toMinutes(date: Date): number {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }

  private parseTimeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + (minutes || 0);
  }

  private getDayName(dayIndex: number): string {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return names[dayIndex];
  }

  private async checkOverlap(
    locationId: string,
    startTime: Date,
    endTime: Date,
    excludeBookingId?: string,
  ): Promise<void> {
    const qb = this.bookingRepo
      .createQueryBuilder('booking')
      .innerJoin('booking.locationDepartment', 'ld')
      .where('ld.locationId = :locationId', { locationId })
      .andWhere('booking.status = :status', { status: BookingStatus.CONFIRMED })
      .andWhere('booking.startTime < :endTime', { endTime })
      .andWhere('booking.endTime > :startTime', { startTime });

    if (excludeBookingId) {
      qb.andWhere('booking.id != :excludeId', { excludeId: excludeBookingId });
    }

    const overlapping = await qb.getOne();

    if (overlapping) {
      throw new ConflictException(
        'Time slot is already booked',
      );
    }
  }
}
