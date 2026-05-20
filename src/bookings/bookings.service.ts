import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { WebsocketGateway } from '../websocket/websocket.gateway';

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
      status: 'ASSIGNED',
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