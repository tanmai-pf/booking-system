import { PartialType } from '@nestjs/mapped-types';
import { CreateLocationDepartmentDto } from './create-location-department.dto';

export class UpdateLocationDepartmentDto extends PartialType(CreateLocationDepartmentDto) {}
