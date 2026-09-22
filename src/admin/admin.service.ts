import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { BookingStatus } from '../common/enums/booking-status.enum';
import { DriverStatus } from '../common/enums/driver-status.enum';

import { BookingsService } from '../bookings/bookings.service';

/* =====================================================
   SHARED SELECTS
===================================================== */

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

  completedAt: true,

  createdAt: true,
  updatedAt: true,
} as const;

/* =====================================================
   LONDON DATE HELPER

   Dispatch operates in London time.

   This avoids problems between:
   - GMT
   - BST
   - server UTC timezone
===================================================== */

const londonDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getLondonDateKey(date: Date) {
  const parts = londonDateFormatter.formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
  ) {}

  /* =====================================================
     DASHBOARD OVERVIEW

     Uses grouped queries instead of multiple individual
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

     Operational booking lanes:

     GREY
     PENDING / ASSIGNED
     = Not Accepted

     RED
     ACCEPTED
     = On Road

     PURPLE
     ARRIVED
     = Arrived / Waiting

     YELLOW
     STARTED
     = Passenger On Board

     GREEN
     COMPLETED
     = Completed Today

     We keep the old:
       - unassignedBookings
       - activeBookings
       - upcomingBookings

     because other parts of the admin/dashboard may still
     depend on those fields.

     Database queries remain efficient:
       1. Dispatch-related bookings
       2. Drivers
  ===================================================== */

  async getDispatchBoard() {
    const now = new Date();

    /*
     * We only need a small recent completed-booking window
     * from PostgreSQL.
     *
     * The final "today" check is performed using London
     * timezone below, which correctly handles GMT/BST.
     */
    const recentCompletedCutoff = new Date(now.getTime() - 36 * 60 * 60 * 1000);

    const londonToday = getLondonDateKey(now);

    const [dispatchBookings, dispatchDrivers] = await Promise.all([
      /* =================================================
         BOOKINGS
      ================================================= */

      this.prisma.booking.findMany({
        where: {
          OR: [
            /*
             * PENDING
             *
             * Normally an unassigned booking.
             */
            {
              status: BookingStatus.PENDING,
            },

            /*
             * ASSIGNED
             *
             * Important:
             * Do NOT restrict this to future pickup only.
             *
             * If the pickup time has passed but the driver
             * has still not accepted, the booking must remain
             * visible in the Not Accepted lane.
             */
            {
              status: BookingStatus.ASSIGNED,
            },

            /*
             * ACTIVE OPERATIONAL STATUSES
             */
            {
              status: {
                in: [
                  BookingStatus.ACCEPTED,
                  BookingStatus.ARRIVED,
                  BookingStatus.STARTED,
                ],
              },
            },

            /*
             * COMPLETED
             *
             * Pull only recent completions from PostgreSQL.
             * Exact London "today" filtering happens below.
             */
            {
              status: BookingStatus.COMPLETED,

              completedAt: {
                gte: recentCompletedCutoff,
              },
            },
          ],
        },

        select: dispatchBookingSelect,

        orderBy: {
          pickupDatetime: 'asc',
        },
      }),

      /* =================================================
         DRIVERS
      ================================================= */

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

    /* =====================================================
       OLD DISPATCH GROUPS

       Keep these for compatibility with existing dashboard
       and frontend code.
    ===================================================== */

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

    /* =====================================================
       NEW DISPATCH STATUS LANES
    ===================================================== */

    /*
     * GREY
     *
     * Booking has not yet been accepted by the driver.
     *
     * Includes:
     * PENDING
     * ASSIGNED
     */
    const notAcceptedBookings = dispatchBookings.filter(
      (booking) =>
        booking.status === BookingStatus.PENDING ||
        booking.status === BookingStatus.ASSIGNED,
    );

    /*
     * RED
     *
     * Driver accepted the booking and is travelling
     * towards the pickup location.
     */
    const onRoadBookings = dispatchBookings.filter(
      (booking) => booking.status === BookingStatus.ACCEPTED,
    );

    /*
     * PURPLE
     *
     * Driver has arrived at pickup and is waiting.
     */
    const arrivedBookings = dispatchBookings.filter(
      (booking) => booking.status === BookingStatus.ARRIVED,
    );

    /*
     * YELLOW
     *
     * Passenger is inside the vehicle and journey
     * is currently underway.
     */
    const passengerOnBoardBookings = dispatchBookings.filter(
      (booking) => booking.status === BookingStatus.STARTED,
    );

    /*
     * GREEN
     *
     * Only bookings completed today in London.
     *
     * Older completed bookings remain available from the
     * normal Bookings screen instead of permanently filling
     * the live Dispatch board.
     */
    const completedBookings = dispatchBookings
      .filter(
        (booking) =>
          booking.status === BookingStatus.COMPLETED &&
          booking.completedAt !== null &&
          getLondonDateKey(booking.completedAt) === londonToday,
      )
      .sort((a, b) => {
        const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;

        const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;

        return bTime - aTime;
      });

    /* =====================================================
       DRIVER GROUPS
    ===================================================== */

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

    /* =====================================================
       RESPONSE
    ===================================================== */

    return {
      summary: {
        /*
         * Existing summary values.
         * Keep for backward compatibility.
         */
        unassignedCount: unassignedBookings.length,

        activeCount: activeBookings.length,

        upcomingCount: upcomingBookings.length,

        /*
         * New operational lane counts.
         */
        notAcceptedCount: notAcceptedBookings.length,

        onRoadCount: onRoadBookings.length,

        arrivedCount: arrivedBookings.length,

        passengerOnBoardCount: passengerOnBoardBookings.length,

        completedCount: completedBookings.length,

        /*
         * Drivers
         */
        availableDrivers: availableDrivers.length,

        busyDrivers: busyDrivers.length,

        offlineDrivers: offlineDrivers.length,

        inactiveDrivers: inactiveDrivers.length,
      },

      /*
       * Existing booking groups.
       *
       * DO NOT REMOVE.
       */
      unassignedBookings,

      activeBookings,

      upcomingBookings,

      /*
       * New booking status lanes.
       */
      notAcceptedBookings,

      onRoadBookings,

      arrivedBookings,

      passengerOnBoardBookings,

      completedBookings,

      /*
       * Drivers
       */
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
