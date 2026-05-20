import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateBookingDto } from './dto/create-booking.dto';
import { AssignDriverDto } from './dto/assign-driver.dto';

import { WebsocketGateway } from '../websocket/websocket.gateway';

import { BookingStatus } from '../common/enums/booking-status.enum';
import { DriverStatus } from '../common/enums/driver-status.enum';

import { DriversService } from '../drivers/drivers.service';

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private websocketGateway: WebsocketGateway,
    private driversService: DriversService,
  ) {}

  async create(createBookingDto: CreateBookingDto) {
    return this.prisma.booking.create({
      data: createBookingDto,
    });
  }

  async findAll() {
    return this.prisma.booking.findMany({
      include: {
        assignedDriver: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async assignDriver(
    bookingId: string,
    assignDriverDto: AssignDriverDto,
  ) {
    const { driverId } = assignDriverDto;

    const booking = await this.prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        assignedDriverId: driverId,
        status: BookingStatus.ASSIGNED,
      },
      include: {
        assignedDriver: true,
      },
    });

    this.websocketGateway.sendBookingToDriver(
      driverId,
      booking,
    );

    return booking;
  }

  async updateBookingStatus(
    bookingId: string,
    status: BookingStatus,
  ) {
    return this.prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        status,
      },
    });
  }

  async acceptBooking(bookingId: string) {
    return this.updateBookingStatus(
      bookingId,
      BookingStatus.ACCEPTED,
    );
  }

  async arrivedBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
    });

    if (booking?.assignedDriverId) {
      await this.driversService.updateDriverStatus(
        booking.assignedDriverId,
        DriverStatus.BUSY,
      );
    }

    return this.updateBookingStatus(
      bookingId,
      BookingStatus.ARRIVED,
    );
  }

  async startBooking(bookingId: string) {
  const booking = await this.prisma.booking.findUnique({
    where: {
      id: bookingId,
    },
  });

  if (booking?.assignedDriverId) {
    await this.driversService.updateDriverStatus(
      booking.assignedDriverId,
      DriverStatus.BUSY,
    );
  }

  return this.updateBookingStatus(
    bookingId,
    BookingStatus.STARTED,
  );
}

  async completeBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
    });

    if (booking?.assignedDriverId) {
      await this.driversService.updateDriverStatus(
        booking.assignedDriverId,
        DriverStatus.AVAILABLE,
      );
    }

    return this.updateBookingStatus(
      bookingId,
      BookingStatus.COMPLETED,
    );
  }

  async rejectBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
    });

    if (booking?.assignedDriverId) {
      await this.driversService.updateDriverStatus(
        booking.assignedDriverId,
        DriverStatus.AVAILABLE,
      );
    }

    return this.updateBookingStatus(
      bookingId,
      BookingStatus.REJECTED,
    );
  }
}