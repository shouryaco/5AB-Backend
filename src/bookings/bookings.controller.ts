import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AssignDriverDto } from './dto/assign-driver.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  create(@Body() createBookingDto: CreateBookingDto) {
    return this.bookingsService.create(createBookingDto);
  }

  @Get()
  findAll() {
    return this.bookingsService.findAll();
  }

  @Patch(':id/assign-driver')
  assignDriver(
    @Param('id') bookingId: string,
    @Body() assignDriverDto: AssignDriverDto,
  ) {
    return this.bookingsService.assignDriver(
      bookingId,
      assignDriverDto.driverId,
    );
  }

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