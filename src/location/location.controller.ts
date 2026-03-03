import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';

import { LocationService } from './location.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { CreateLocationDepartmentDto } from './dto/create-location-department.dto';
import { UpdateLocationDepartmentDto } from './dto/update-location-department.dto';
import { AuthGuard, AdminGuard } from '../common/guards/auth.guard';

@UseGuards(AuthGuard, AdminGuard)
@Controller('locations')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Post()
  create(@Body() dto: CreateLocationDto) {
    return this.locationService.create(dto);
  }

  @Get('tree')
  findTree() {
    return this.locationService.findTree();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.locationService.findOne(id);
  }

  @Get(':id/descendants')
  findDescendants(@Param('id', ParseUUIDPipe) id: string) {
    return this.locationService.findDescendants(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.locationService.remove(id);
  }

  @Post(':id/departments')
  addDepartment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLocationDepartmentDto,
  ) {
    return this.locationService.addDepartment(id, dto);
  }

  @Patch('departments/:deptId')
  updateDepartment(
    @Param('deptId', ParseUUIDPipe) deptId: string,
    @Body() dto: UpdateLocationDepartmentDto,
  ) {
    return this.locationService.updateDepartment(deptId, dto);
  }

  @Delete('departments/:deptId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDepartment(@Param('deptId', ParseUUIDPipe) deptId: string) {
    return this.locationService.removeDepartment(deptId);
  }
}
