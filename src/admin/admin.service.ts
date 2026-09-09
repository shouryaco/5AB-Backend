import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { BookingStatus } from '../common/enums/booking-status.enum';
import { DriverStatus } from '../common/enums/driver-status.enum';

import { BookingsService } from '../bookings/bookings.service';

const dispatchDriverSelect = {
  id: true,
  name: true,
  phone: true,
  vehicleName: true,
  vehicleNumber: true,
  status: true,
} as const;

const dispatchBookingSelect = {
  id: true,
  bookingReference: true,

  customerName: true,
  customerPhone: true,
  customerEmail: true,

  pickupAddress: true,
  dropoffAddress: true,
  pickupDatetime: true,

  passengers: true,
  luggage: true,

  journeyType: true,
  notes: true,

  status: true,
  assignedDriverId: true,

  estimatedDurationMinutes: true,

  assignedDriver: {
    select: dispatchDriverSelect,
  },

  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
  ) {}

  /* =====================================================
     DASHBOARD OVERVIEW

     Uses two grouped queries instead of eight separate
     count queries.
  ===================================================== */

  async getOverview() {
    const [bookingGroups, driverGroups] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ['status'],
        _count: {
          _all: true,
        },
      }),

      this.prisma.driver.groupBy({
        by: ['status'],
        _count: {
          _all: true,
        },
      }),
    ]);

    const bookingCounts: Record<string, number> = {};
    const driverCounts: Record<string, number> = {};

    for (const group of bookingGroups) {
      bookingCounts[String(group.status)] = group._count._all;
    }

    for (const group of driverGroups) {
      driverCounts[String(group.status)] = group._count._all;
    }

    const totalBookings = bookingGroups.reduce(
      (total, group) => total + group._count._all,
      0,
    );

    const activeTrips =
      (bookingCounts[BookingStatus.ACCEPTED] ?? 0) +
      (bookingCounts[BookingStatus.ARRIVED] ?? 0) +
      (bookingCounts[BookingStatus.STARTED] ?? 0);

    return {
      totalBookings,
      activeTrips,
      completedTrips: bookingCounts[BookingStatus.COMPLETED] ?? 0,
      cancelledTrips: bookingCounts[BookingStatus.CANCELLED] ?? 0,

      drivers: {
        availableDrivers: driverCounts[DriverStatus.AVAILABLE] ?? 0,
        busyDrivers: driverCounts[DriverStatus.BUSY] ?? 0,
        offlineDrivers: driverCounts[DriverStatus.OFFLINE] ?? 0,
        inactiveDrivers: driverCounts[DriverStatus.INACTIVE] ?? 0,
      },
    };
  }

  /* =====================================================
     DISPATCH BOARD

     The old implementation performed separate queries for:
       - unassigned bookings
       - active bookings
       - upcoming bookings
       - available drivers
       - busy drivers
       - offline drivers
       - inactive drivers

     This version performs only TWO database queries:
       1. all bookings needed by the dispatch board
       2. all drivers needed by the dispatch board

     The results are then partitioned in memory.
  ===================================================== */

  async getDispatchBoard() {
    const now = new Date();

    const [dispatchBookings, dispatchDrivers] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          OR: [
            {
              status: BookingStatus.PENDING,
              assignedDriverId: null,
            },
            {
              status: BookingStatus.ASSIGNED,
              pickupDatetime: {
                gt: now,
              },
            },
            {
              status: {
                in: [
                  BookingStatus.ACCEPTED,
                  BookingStatus.ARRIVED,
                  BookingStatus.STARTED,
                ],
              },
            },
          ],
        },

        select: dispatchBookingSelect,

        orderBy: {
          pickupDatetime: 'asc',
        },
      }),

      this.prisma.driver.findMany({
        where: {
          status: {
            in: [
              DriverStatus.AVAILABLE,
              DriverStatus.BUSY,
              DriverStatus.OFFLINE,
              DriverStatus.INACTIVE,
            ],
          },
        },

        select: dispatchDriverSelect,

        orderBy: {
          name: 'asc',
        },
      }),
    ]);

    const unassignedBookings = dispatchBookings.filter(
      (booking) =>
        booking.status === BookingStatus.PENDING &&
        booking.assignedDriverId === null,
    );

    const activeBookings = dispatchBookings.filter((booking) =>
      [
        BookingStatus.ACCEPTED,
        BookingStatus.ARRIVED,
        BookingStatus.STARTED,
      ].includes(booking.status as BookingStatus),
    );

    const upcomingBookings = dispatchBookings.filter(
      (booking) =>
        booking.status === BookingStatus.ASSIGNED &&
        booking.pickupDatetime > now,
    );

    const availableDrivers = dispatchDrivers.filter(
      (driver) => driver.status === DriverStatus.AVAILABLE,
    );

    const busyDrivers = dispatchDrivers.filter(
      (driver) => driver.status === DriverStatus.BUSY,
    );

    const offlineDrivers = dispatchDrivers.filter(
      (driver) => driver.status === DriverStatus.OFFLINE,
    );

    const inactiveDrivers = dispatchDrivers.filter(
      (driver) => driver.status === DriverStatus.INACTIVE,
    );

    return {
      summary: {
        unassignedCount: unassignedBookings.length,
        activeCount: activeBookings.length,
        upcomingCount: upcomingBookings.length,

        availableDrivers: availableDrivers.length,
        busyDrivers: busyDrivers.length,
        offlineDrivers: offlineDrivers.length,
        inactiveDrivers: inactiveDrivers.length,
      },

      unassignedBookings,
      activeBookings,
      upcomingBookings,

      availableDrivers,
      busyDrivers,
      offlineDrivers,
      inactiveDrivers,
    };
  }

  /* =====================================================
     DISPATCH ASSIGNMENT

     Delegate to BookingsService so the admin compatibility
     endpoint uses the same assignment rules as the main
     booking assignment endpoint.
  ===================================================== */

  async assignDriverToBooking(bookingId: string, driverId: string) {
    return this.bookingsService.assignDriver(bookingId, {
      driverId,
    });
  }
}
