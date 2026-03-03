import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, TreeRepository } from 'typeorm';
import { Location } from './location.entity';
import { LocationDepartment } from './location-department.entity';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { CreateLocationDepartmentDto } from './dto/create-location-department.dto';
import { UpdateLocationDepartmentDto } from './dto/update-location-department.dto';

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    @InjectRepository(Location)
    private readonly locationTreeRepo: TreeRepository<Location>,
    @InjectRepository(LocationDepartment)
    private readonly locationDeptRepo: Repository<LocationDepartment>,
  ) {}

  async create(dto: CreateLocationDto): Promise<Location> {
    this.logger.log(`Creating location: ${dto.name} (${dto.code})`);

    const existing = await this.locationTreeRepo.findOne({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(
        `Location with code "${dto.code}" already exists`,
      );
    }

    const location = this.locationTreeRepo.create({
      name: dto.name,
      code: dto.code,
      bookable: dto.bookable ?? false,
    });

    if (dto.parentId) {
      const parent = await this.locationTreeRepo.findOne({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(
          `Parent location with id "${dto.parentId}" not found`,
        );
      }
      location.parent = parent;
    }

    return this.locationTreeRepo.save(location);
  }

  async findTree(): Promise<Location[]> {
    this.logger.log('Retrieving full location tree');
    const trees = await this.locationTreeRepo.findTrees({
      relations: ['departments'],
    });
    return trees;
  }

  async findOne(id: string): Promise<Location> {
    const location = await this.locationTreeRepo.findOne({
      where: { id },
      relations: ['departments', 'children'],
    });
    if (!location) {
      throw new NotFoundException(`Location with id "${id}" not found`);
    }
    return location;
  }

  async findDescendants(id: string): Promise<Location> {
    const location = await this.locationTreeRepo.findOne({
      where: { id },
    });
    if (!location) {
      throw new NotFoundException(`Location with id "${id}" not found`);
    }
    return this.locationTreeRepo.findDescendantsTree(location, {
      relations: ['departments'],
    });
  }

  async update(id: string, dto: UpdateLocationDto): Promise<Location> {
    this.logger.log(`Updating location: ${id}`);
    const location = await this.findOne(id);

    if (dto.parentId && dto.parentId !== location.parent?.id) {
      const newParent = await this.locationTreeRepo.findOne({
        where: { id: dto.parentId },
      });
      if (!newParent) {
        throw new NotFoundException(
          `Parent location with id "${dto.parentId}" not found`,
        );
      }
      location.parent = newParent;
    }

    if (dto.name !== undefined) location.name = dto.name;
    if (dto.code !== undefined) location.code = dto.code;
    if (dto.bookable !== undefined) location.bookable = dto.bookable;

    return this.locationTreeRepo.save(location);
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting location: ${id}`);
    const location = await this.locationTreeRepo.findOne({
      where: { id },
    });
    if (!location) {
      throw new NotFoundException(`Location with id "${id}" not found`);
    }
    await this.locationTreeRepo.remove(location);
  }

  // --- Location Department operations ---

  async addDepartment(
    locationId: string,
    dto: CreateLocationDepartmentDto,
  ): Promise<LocationDepartment> {
    this.logger.log(
      `Adding department "${dto.department}" to location ${locationId}`,
    );

    const location = await this.findOne(locationId);
    if (!location.bookable) {
      throw new BadRequestException('This location is not bookable');
    }

    const existing = await this.locationDeptRepo.findOne({
      where: { locationId, department: dto.department },
    });
    if (existing) {
      throw new ConflictException(
        `Department "${dto.department}" is already allocated to this location`,
      );
    }

    const dept = this.locationDeptRepo.create({
      locationId,
      department: dto.department,
      capacity: dto.capacity,
      openDays: dto.openDays,
      openStart: dto.openStart || null,
      openEnd: dto.openEnd || null,
    });

    return this.locationDeptRepo.save(dept);
  }

  async updateDepartment(
    deptId: string,
    dto: UpdateLocationDepartmentDto,
  ): Promise<LocationDepartment> {
    this.logger.log(`Updating department allocation: ${deptId}`);

    const dept = await this.locationDeptRepo.findOne({
      where: { id: deptId },
    });
    if (!dept) {
      throw new NotFoundException(
        `Department allocation with id "${deptId}" not found`,
      );
    }

    Object.assign(dept, dto);
    return this.locationDeptRepo.save(dept);
  }

  async removeDepartment(deptId: string): Promise<void> {
    this.logger.log(`Removing department allocation: ${deptId}`);

    const dept = await this.locationDeptRepo.findOne({
      where: { id: deptId },
    });
    if (!dept) {
      throw new NotFoundException(
        `Department allocation with id "${deptId}" not found`,
      );
    }

    await this.locationDeptRepo.remove(dept);
  }
}
