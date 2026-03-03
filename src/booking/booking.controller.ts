import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';

import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { AuthGuard, AdminGuard } from '../common/guards/auth.guard';
import type { JwtUser } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(AuthGuard)
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  create(@Body() dto: CreateBookingDto, @CurrentUser() user: JwtUser) {
    return this.bookingService.create(dto, user);
  }

  @Get()
  findMyBookings(@CurrentUser() user: JwtUser) {
    return this.bookingService.findAll({ bookedBy: user.sub });
  }

  @UseGuards(AdminGuard)
  @Get('department/:department')
  findByDepartment(@Param('department') department: string) {
    return this.bookingService.findAll({ department });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingDto,
  ) {
    return this.bookingService.update(id, dto);
  }

  @Delete(':id')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingService.cancel(id);
  }
}
