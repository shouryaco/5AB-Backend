import { Injectable, BadRequestException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateBookingDto } from './dto/create-booking.dto';
import { AssignDriverDto } from './dto/assign-driver.dto';

import { WebsocketGateway } from '../websocket/websocket.gateway';

import { BookingStatus } from '../common/enums/booking-status.enum';
import { DriverStatus } from '../common/enums/driver-status.enum';

import { DriversService } from '../drivers/drivers.service';

import { QueryBookingDto } from './dto/query-booking.dto';

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private websocketGateway: WebsocketGateway,
    private driversService: DriversService,
  ) {}

  async createBookingHistory(
    bookingId: string,
    status: BookingStatus,
    notes?: string,
  ) {
    return this.prisma.bookingStatusHistory.create({
      data: {
        bookingId,
        status,
        notes,
      },
    });
  }

  async create(createBookingDto: CreateBookingDto) {
    const booking = await this.prisma.booking.create({
      data: createBookingDto,
    });

    await this.createBookingHistory(
      booking.id,
      BookingStatus.PENDING,
      'Booking created',
    );

    return booking;
  }

  async findAll(query: QueryBookingDto) {
    const {
      status,
      driverId,
      search,
      upcoming,
      active,
      page = '1',
      limit = '20',
    } = query;

    const where: any = {};

    // Status filter
    if (status) {
      where.status = status;
    }

    // Driver filter
    if (driverId) {
      where.assignedDriverId = driverId;
    }

    // Search filter
    if (search) {
      where.OR = [
        {
          customerName: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          bookingReference: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          customerPhone: {
            contains: search,
          },
        },
      ];
    }

    // Upcoming filter
    if (upcoming === 'true') {
      where.pickupDatetime = {
        gte: new Date(),
      };
    }

    // Active filter
    if (active === 'true') {
      where.status = {
        in: [
          BookingStatus.ACCEPTED,
          BookingStatus.ARRIVED,
          BookingStatus.STARTED,
        ],
      };
    }

    const currentPage = Number(page);
    const perPage = Number(limit);

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,

        include: {
          assignedDriver: true,
          bookingStatusHistories: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },

        orderBy: {
          createdAt: 'desc',
        },

        skip: (currentPage - 1) * perPage,
        take: perPage,
      }),

      this.prisma.booking.count({
        where,
      }),
    ]);

    return {
      data: bookings,

      pagination: {
        total,
        page: currentPage,
        limit: perPage,
        totalPages: Math.ceil(total / perPage),
      },
    };
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

    const booking = await this.prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
    });

    if (!booking) {
      throw new BadRequestException('Booking not found');
    }

    const hasConflict = await this.hasDriverConflict(
      driverId,
      booking.pickupDatetime,
    );

    if (hasConflict) {
      throw new BadRequestException('Driver already has a conflicting booking');
    }

    const updatedBooking = await this.prisma.booking.update({
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

    await this.createBookingHistory(
      updatedBooking.id,
      BookingStatus.ASSIGNED,
      'Driver assigned',
    );

    this.websocketGateway.sendBookingToDriver(driverId, updatedBooking);

    return updatedBooking;
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
    const booking = await this.prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        status: BookingStatus.ACCEPTED,
        acceptedAt: new Date(),
      },
    });

    await this.createBookingHistory(
      bookingId,
      BookingStatus.ACCEPTED,
      'Driver accepted booking',
    );

    return booking;
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

    const updatedBooking = await this.prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        status: BookingStatus.ARRIVED,
        arrivedAt: new Date(),
      },
    });

    await this.createBookingHistory(
      bookingId,
      BookingStatus.ARRIVED,
      'Driver arrived at pickup location',
    );

    return updatedBooking;
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

    const updatedBooking = await this.prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        status: BookingStatus.STARTED,
        startedAt: new Date(),
      },
    });

    await this.createBookingHistory(
      bookingId,
      BookingStatus.STARTED,
      'Journey started',
    );

    return updatedBooking;
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

    const updatedBooking = await this.prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        status: BookingStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    await this.createBookingHistory(
      bookingId,
      BookingStatus.COMPLETED,
      'Trip completed',
    );

    return updatedBooking;
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

    const updatedBooking = await this.prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        status: BookingStatus.REJECTED,
        rejectedAt: new Date(),
      },
    });

    await this.createBookingHistory(
      bookingId,
      BookingStatus.REJECTED,
      'Driver rejected booking',
    );

    return updatedBooking;
  }

  async cancelBooking(bookingId: string) {
    const updatedBooking = await this.prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    await this.createBookingHistory(
      bookingId,
      BookingStatus.CANCELLED,
      'Booking cancelled',
    );

    return updatedBooking;
  }

  async hasDriverConflict(driverId: string, pickupDatetime: Date) {
    const twoHoursBefore = new Date(
      pickupDatetime.getTime() - 2 * 60 * 60 * 1000,
    );

    const twoHoursAfter = new Date(
      pickupDatetime.getTime() + 2 * 60 * 60 * 1000,
    );

    const conflictingBooking = await this.prisma.booking.findFirst({
      where: {
        assignedDriverId: driverId,

        status: {
          in: [
            BookingStatus.ASSIGNED,
            BookingStatus.ACCEPTED,
            BookingStatus.ARRIVED,
            BookingStatus.STARTED,
          ],
        },

        pickupDatetime: {
          gte: twoHoursBefore,
          lte: twoHoursAfter,
        },
      },
    });

    return !!conflictingBooking;
  }
}
