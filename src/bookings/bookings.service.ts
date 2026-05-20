import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { BookingStatus } from '../common/enums/booking-status.enum';
import { PrismaClient, Prisma } from '@prisma/client';
@Injectable()
export class BookingsService {
  constructor(
  private prisma: PrismaService,
  private websocketGateway: WebsocketGateway,
) {}

  async create(createBookingDto: CreateBookingDto) {
    return this.prisma.booking.create({
      data: {
        ...createBookingDto,
        pickupDatetime: new Date(createBookingDto.pickupDatetime),
      },
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
  return this.updateBookingStatus(
    bookingId,
    BookingStatus.ARRIVED,
  );
}

async startBooking(bookingId: string) {
  return this.updateBookingStatus(
    bookingId,
    BookingStatus.STARTED,
  );
}

async completeBooking(bookingId: string) {
  return this.updateBookingStatus(
    bookingId,
    BookingStatus.COMPLETED,
  );
}

async rejectBooking(bookingId: string) {
  return this.updateBookingStatus(
    bookingId,
    BookingStatus.REJECTED,
  );
}

  async assignDriver(bookingId: string, driverId: string) {
  const driver = await this.prisma.driver.findUnique({
    where: {
      id: driverId,
    },
  });

  if (!driver) {
    throw new NotFoundException('Driver not found');
  }

  const updatedBooking = await this.prisma.booking.update({
    where: {
      id: bookingId,
    },
    data: {
      assignedDriverId: driverId,
      status: BookingStatus.ASSIGNED
    },
    include: {
      assignedDriver: true,
    },
  });

  this.websocketGateway.sendBookingToDriver(
    driverId,
    updatedBooking,
  );

  return updatedBooking;
}
}