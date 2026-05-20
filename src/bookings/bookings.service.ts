import { Injectable, BadRequestException } from '@nestjs/common';

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

  async assignDriver(bookingId: string, assignDriverDto: AssignDriverDto) {
    const { driverId } = assignDriverDto;

    const driver = await this.prisma.driver.findUnique({
      where: {
        id: driverId,
      },
    });

    if (!driver) {
      throw new BadRequestException('Driver not found');
    }
    if (driver.status === DriverStatus.INACTIVE) {
      throw new BadRequestException('Driver is inactive');
    }

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

    this.websocketGateway.sendBookingToDriver(driverId, booking);

    return booking;
  }

  async updateBookingStatus(bookingId: string, status: BookingStatus) {
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
    return this.prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        status: BookingStatus.ACCEPTED,
        acceptedAt: new Date(),
      },
    });
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

    return this.prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        status: BookingStatus.ARRIVED,
        arrivedAt: new Date(),
      },
    });
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

    return this.prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        status: BookingStatus.STARTED,
        startedAt: new Date(),
      },
    });
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

    return this.prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        status: BookingStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
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

    return this.prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        status: BookingStatus.REJECTED,
        rejectedAt: new Date(),
      },
    });
  }
  async cancelBooking(bookingId: string) {
    return this.prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });
  }
}
