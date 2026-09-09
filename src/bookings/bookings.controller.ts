import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { BookingsService } from './bookings.service';

import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { QueryBookingDto } from './dto/query-booking.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DISPATCHER')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /* =====================================================
     CREATE
  ===================================================== */

  @Post()
  create(@Body() createBookingDto: CreateBookingDto) {
    return this.bookingsService.create(createBookingDto);
  }

  /* =====================================================
     LIST
  ===================================================== */

  @Get()
  findAll(@Query() query: QueryBookingDto) {
    return this.bookingsService.findAll(query);
  }

  /* =====================================================
     SINGLE BOOKING
  ===================================================== */

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bookingsService.findOne(id);
  }

  /* =====================================================
     UPDATE
  ===================================================== */

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBookingDto: UpdateBookingDto) {
    return this.bookingsService.update(id, updateBookingDto);
  }

  /* =====================================================
     DRIVER ASSIGNMENT
  ===================================================== */

  @Patch(':id/assign-driver')
  assignDriver(
    @Param('id') bookingId: string,
    @Body() assignDriverDto: AssignDriverDto,
  ) {
    return this.bookingsService.assignDriver(bookingId, assignDriverDto);
  }

  /* =====================================================
     CANCELLATION
  ===================================================== */

  @Patch(':id/cancel')
  cancelBooking(@Param('id') id: string) {
    return this.bookingsService.cancelBooking(id);
  }

  /* =====================================================
     BOOKING LIFECYCLE

     These routes are currently restricted to ADMIN and
     DISPATCHER. Do not add DRIVER here until driver-specific
     ownership checks exist, otherwise a driver could call a
     lifecycle endpoint for another driver's booking by ID.
  ===================================================== */

  @Patch(':id/accept')
  acceptBooking(@Param('id') id: string) {
    return this.bookingsService.acceptBooking(id);
  }

  @Patch(':id/arrived')
  arrivedBooking(@Param('id') id: string) {
    return this.bookingsService.arrivedBooking(id);
  }

  @Patch(':id/start')
  startBooking(@Param('id') id: string) {
    return this.bookingsService.startBooking(id);
  }

  @Patch(':id/complete')
  completeBooking(@Param('id') id: string) {
    return this.bookingsService.completeBooking(id);
  }

  @Patch(':id/reject')
  rejectBooking(@Param('id') id: string) {
    return this.bookingsService.rejectBooking(id);
  }
}
