import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus } from '../common/enums/booking-status.enum';
import { DriverStatus } from '../common/enums/driver-status.enum';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { BookingsService } from '../bookings/bookings.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private websocketGateway: WebsocketGateway,
    private bookingsService: BookingsService,
  ) {}

  async getOverview() {
    const [
      totalBookings,
      activeTrips,
      completedTrips,
      cancelledTrips,
      availableDrivers,
      busyDrivers,
      offlineDrivers,
      inactiveDrivers,
    ] = await Promise.all([
      this.prisma.booking.count(),

      this.prisma.booking.count({
        where: {
          status: {
            in: [BookingStatus.STARTED, BookingStatus.ARRIVED],
          },
        },
      }),

      this.prisma.booking.count({
        where: {
          status: BookingStatus.COMPLETED,
        },
      }),

      this.prisma.booking.count({
        where: {
          status: BookingStatus.CANCELLED,
        },
      }),

      this.prisma.driver.count({
        where: {
          status: DriverStatus.AVAILABLE,
        },
      }),

      this.prisma.driver.count({
        where: {
          status: DriverStatus.BUSY,
        },
      }),

      this.prisma.driver.count({
        where: {
          status: DriverStatus.OFFLINE,
        },
      }),

      this.prisma.driver.count({
        where: {
          status: DriverStatus.INACTIVE,
        },
      }),
    ]);

    return {
      totalBookings,
      activeTrips,
      completedTrips,
      cancelledTrips,
      drivers: {
        availableDrivers,
        busyDrivers,
        offlineDrivers,
        inactiveDrivers,
      },
    };
  }

  async getDispatchBoard() {
    const [
      unassignedBookings,
      activeBookings,
      upcomingBookings,
      availableDrivers,
      busyDrivers,
    ] = await Promise.all([
      // 1. Unassigned (waiting for driver)
      this.prisma.booking.findMany({
        where: {
          status: BookingStatus.PENDING,
          assignedDriverId: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),

      // 2. Active trips
      this.prisma.booking.findMany({
        where: {
          status: {
            in: [
              BookingStatus.ACCEPTED,
              BookingStatus.ARRIVED,
              BookingStatus.STARTED,
            ],
          },
        },
        include: {
          assignedDriver: true,
        },
        orderBy: {
          pickupDatetime: 'asc',
        },
      }),

      // 3. Upcoming bookings (future trips)
      this.prisma.booking.findMany({
        where: {
          status: BookingStatus.ASSIGNED,
          pickupDatetime: {
            gt: new Date(),
          },
        },
        include: {
          assignedDriver: true,
        },
        orderBy: {
          pickupDatetime: 'asc',
        },
      }),

      // 4. Available drivers
      this.prisma.driver.findMany({
        where: {
          status: DriverStatus.AVAILABLE,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      }),

      // 5. Busy drivers
      this.prisma.driver.findMany({
        where: {
          status: DriverStatus.BUSY,
        },
        include: {
          bookings: true,
        },
      }),
    ]);

    return {
      summary: {
        unassignedCount: unassignedBookings.length,
        activeCount: activeBookings.length,
        upcomingCount: upcomingBookings.length,
        availableDrivers: availableDrivers.length,
        busyDrivers: busyDrivers.length,
      },
      unassignedBookings,
      activeBookings,
      upcomingBookings,
      availableDrivers,
      busyDrivers,
    };
  }

  async assignDriverToBooking(bookingId: string, driverId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      throw new Error('Driver not found');
    }

    const hasConflict = await this.bookingsService.hasDriverConflict(
      driverId,
      booking.pickupDatetime,
      booking.estimatedDurationMinutes,
    );

    if (hasConflict) {
      throw new Error('Driver already has a conflicting booking');
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        assignedDriverId: driverId,
        status: 'ASSIGNED',
      },
      include: {
        assignedDriver: true,
      },
    });

    this.websocketGateway.sendBookingToDriver(driverId, updatedBooking);

    // OPTIONAL: create history (if you already built it)
    await this.prisma.bookingStatusHistory.create({
      data: {
        bookingId,
        status: 'ASSIGNED',
        notes: 'Manually assigned by admin',
      },
    });

    return updatedBooking;
  }
}
