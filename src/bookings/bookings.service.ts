import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateBookingDto } from './dto/create-booking.dto';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { QueryBookingDto } from './dto/query-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

import { WebsocketGateway } from '../websocket/websocket.gateway';

import { BookingStatus } from '../common/enums/booking-status.enum';
import { DriverStatus } from '../common/enums/driver-status.enum';

const safeAssignedDriverSelect = {
  id: true,
  name: true,
  phone: true,
  vehicleName: true,
  vehicleNumber: true,
  status: true,
  driverType: true,
  callSign: true,
  driverGrade: true,
} as const;

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private websocketGateway: WebsocketGateway,
  ) {}

  /* =====================================================
     BOOKING HISTORY
  ===================================================== */

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

  /* =====================================================
     CREATE BOOKING
  ===================================================== */

  async create(createBookingDto: CreateBookingDto) {
    const {
      accountId,
      assignedDriverId,
      bookers,
      passengersList,
      vias,
      finance,
      ...bookingData
    } = createBookingDto;

    /* =====================================================
       GENERATE BOOKING REFERENCE
    ===================================================== */

    const generatedBookingReference = `5AB-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase()}`;

    /* =====================================================
       CLIENT ACCOUNT VALIDATION
    ===================================================== */

    if (accountId) {
      const account = await this.prisma.clientAccount.findUnique({
        where: {
          id: accountId,
        },
        select: {
          id: true,
          isActive: true,
        },
      });

      if (!account) {
        throw new BadRequestException('Client account not found');
      }

      if (!account.isActive) {
        throw new BadRequestException('Client account is inactive');
      }
    }

    /* =====================================================
       BOOKER VALIDATION
    ===================================================== */

    if (bookers && bookers.length > 0) {
      const rawBookerIds = bookers.map((item) => item.bookerId);
      const bookerIds = [...new Set(rawBookerIds)];

      if (bookerIds.length !== rawBookerIds.length) {
        throw new BadRequestException('Duplicate bookers are not allowed');
      }

      const existingBookers = await this.prisma.booker.findMany({
        where: {
          id: {
            in: bookerIds,
          },
        },
        select: {
          id: true,
          accountId: true,
        },
      });

      if (existingBookers.length !== bookerIds.length) {
        throw new BadRequestException(
          'One or more selected bookers could not be found',
        );
      }

      if (accountId) {
        const invalidBooker = existingBookers.find(
          (booker) => booker.accountId && booker.accountId !== accountId,
        );

        if (invalidBooker) {
          throw new BadRequestException(
            'One or more selected bookers belong to a different client account',
          );
        }
      }
    }

    /* =====================================================
       PASSENGER VALIDATION
    ===================================================== */

    if (passengersList && passengersList.length > 0) {
      const rawPassengerIds = passengersList.map((item) => item.passengerId);
      const passengerIds = [...new Set(rawPassengerIds)];

      if (passengerIds.length !== rawPassengerIds.length) {
        throw new BadRequestException('Duplicate passengers are not allowed');
      }

      const existingPassengers = await this.prisma.passenger.findMany({
        where: {
          id: {
            in: passengerIds,
          },
        },
        select: {
          id: true,
          accountId: true,
        },
      });

      if (existingPassengers.length !== passengerIds.length) {
        throw new BadRequestException(
          'One or more selected passengers could not be found',
        );
      }

      if (accountId) {
        const invalidPassenger = existingPassengers.find(
          (passenger) =>
            passenger.accountId && passenger.accountId !== accountId,
        );

        if (invalidPassenger) {
          throw new BadRequestException(
            'One or more selected passengers belong to a different client account',
          );
        }
      }
    }

    /* =====================================================
       DRIVER VALIDATION + CONFLICT CHECK
    ===================================================== */

    if (assignedDriverId) {
      const driver = await this.prisma.driver.findUnique({
        where: {
          id: assignedDriverId,
        },
      });

      if (!driver) {
        throw new BadRequestException('Driver not found');
      }

      /*
       * AVAILABLE / BUSY / OFFLINE drivers can
       * still receive future bookings.
       *
       * Only INACTIVE blocks assignment.
       */
      if (driver.status === DriverStatus.INACTIVE) {
        throw new BadRequestException('Driver is inactive');
      }

      const pickupDatetime = new Date(createBookingDto.pickupDatetime);

      const estimatedDuration =
        createBookingDto.estimatedDurationMinutes ?? 120;

      const hasConflict = await this.hasDriverConflict(
        assignedDriverId,
        pickupDatetime,
        estimatedDuration,
      );

      if (hasConflict) {
        throw new BadRequestException(
          'Driver has conflicting booking schedule',
        );
      }
    }

    /* =====================================================
       CREATE COMPLETE BOOKING
    ===================================================== */

    const booking = await this.prisma.booking.create({
      data: {
        /* =================================================
             BASIC
          ================================================= */

        bookingReference: generatedBookingReference,

        /* =================================================
             COMPATIBILITY CUSTOMER
          ================================================= */

        customerName: bookingData.customerName.trim(),

        customerPhone: bookingData.customerPhone.trim(),

        customerEmail: bookingData.customerEmail?.trim() || undefined,

        /* =================================================
             ACCOUNT ALLOCATION
          ================================================= */

        account: accountId
          ? {
              connect: {
                id: accountId,
              },
            }
          : undefined,

        costCenter: bookingData.costCenter?.trim() || undefined,

        invoiceRef: bookingData.invoiceRef?.trim() || undefined,

        jobStatus: bookingData.jobStatus?.trim() || undefined,

        salesman: bookingData.salesman?.trim() || undefined,

        nameCardOverride: bookingData.nameCardOverride?.trim() || undefined,

        nameCardFileUrl: bookingData.nameCardFileUrl?.trim() || undefined,

        /* =================================================
             JOURNEY
          ================================================= */

        pickupAddress: bookingData.pickupAddress.trim(),

        dropoffAddress: bookingData.dropoffAddress.trim(),

        pickupDatetime: new Date(bookingData.pickupDatetime),

        journeyType: bookingData.journeyType?.trim() || undefined,

        /* =================================================
             PASSENGER / LUGGAGE
          ================================================= */

        passengers: bookingData.passengers,

        luggage: bookingData.luggage,

        bigLuggage: bookingData.bigLuggage ?? 0,

        smallLuggage: bookingData.smallLuggage ?? 0,

        babySeats: bookingData.babySeats ?? 0,

        childSeats: bookingData.childSeats ?? 0,

        boosterSeats: bookingData.boosterSeats ?? 0,

        /* =================================================
             NOTES
          ================================================= */

        notes: bookingData.notes?.trim() || undefined,

        driverNote: bookingData.driverNote?.trim() || undefined,

        /* =================================================
             ROUTE / VEHICLE
          ================================================= */

        preferredVehicleCategory:
          bookingData.preferredVehicleCategory?.trim() || undefined,

        requestedDriverType:
          bookingData.requestedDriverType?.trim() || undefined,

        routeDistanceMeters: bookingData.routeDistanceMeters,

        routeDurationSeconds: bookingData.routeDurationSeconds,

        estimatedDurationMinutes: bookingData.estimatedDurationMinutes ?? 120,

        /* =================================================
             DRIVER
          ================================================= */

        assignedDriver: assignedDriverId
          ? {
              connect: {
                id: assignedDriverId,
              },
            }
          : undefined,

        status: assignedDriverId
          ? BookingStatus.ASSIGNED
          : BookingStatus.PENDING,

        /* =================================================
             BOOKERS
          ================================================= */

        bookers:
          bookers && bookers.length > 0
            ? {
                create: bookers.map((item, index) => ({
                  booker: {
                    connect: {
                      id: item.bookerId,
                    },
                  },

                  isPrimary: item.isPrimary ?? index === 0,

                  position: item.position ?? index,
                })),
              }
            : undefined,

        /* =================================================
             PASSENGERS
          ================================================= */

        passengersList:
          passengersList && passengersList.length > 0
            ? {
                create: passengersList.map((item, index) => ({
                  passenger: {
                    connect: {
                      id: item.passengerId,
                    },
                  },

                  isPrimary: item.isPrimary ?? index === 0,

                  position: item.position ?? index,
                })),
              }
            : undefined,

        /* =================================================
             VIA STOPS
          ================================================= */

        vias:
          vias && vias.length > 0
            ? {
                create: vias.map((via, index) => ({
                  address: via.address.trim(),

                  position: via.position ?? index,

                  latitude: via.latitude,

                  longitude: via.longitude,
                })),
              }
            : undefined,

        /* =================================================
             FINANCE
          ================================================= */

        finance: finance
          ? {
              create: {
                /* ---------------- CLIENT ---------------- */

                clientQuote: finance.clientQuote,

                clientWaitingCharge: finance.clientWaitingCharge,

                clientParking: finance.clientParking,

                clientCongestion: finance.clientCongestion,

                clientDiscount: finance.clientDiscount,

                clientTotal: finance.clientTotal,

                clientAdminFee: finance.clientAdminFee,

                clientNet: finance.clientNet,

                clientVat: finance.clientVat,

                clientVatPercent: finance.clientVatPercent,

                clientTotalAmount: finance.clientTotalAmount,

                clientWaitingIncluded: finance.clientWaitingIncluded ?? false,

                clientParkingIncluded: finance.clientParkingIncluded ?? false,

                clientPriceOverride: finance.clientPriceOverride ?? false,

                /* ---------------- DRIVER ---------------- */

                driverCost: finance.driverCost,

                driverWaitingPay: finance.driverWaitingPay,

                driverParking: finance.driverParking,

                driverCongestion: finance.driverCongestion,

                driverTotal: finance.driverTotal,

                driverWaitingIncluded: finance.driverWaitingIncluded ?? false,

                driverParkingIncluded: finance.driverParkingIncluded ?? false,

                driverPayAsStandard: finance.driverPayAsStandard ?? false,

                driverPriceOverride: finance.driverPriceOverride ?? false,

                /* ---------------- PAYMENT ---------------- */

                paymentType: finance.paymentType?.trim() || undefined,

                /* ---------------- NOTES ---------------- */

                financeNote: finance.financeNote?.trim() || undefined,

                invoiceNote: finance.invoiceNote?.trim() || undefined,

                extraNote: finance.extraNote?.trim() || undefined,
              },
            }
          : undefined,

        /* =================================================
             BOOKING STATUS HISTORY
          ================================================= */

        bookingStatusHistories: {
          create: assignedDriverId
            ? [
                {
                  status: BookingStatus.PENDING,

                  notes: 'Booking created',
                },
                {
                  status: BookingStatus.ASSIGNED,

                  notes: 'Driver assigned during booking creation',
                },
              ]
            : [
                {
                  status: BookingStatus.PENDING,

                  notes: 'Booking created',
                },
              ],
        },
      },

      include: {
        account: true,

        assignedDriver: {
          select: safeAssignedDriverSelect,
        },

        bookers: {
          orderBy: {
            position: 'asc',
          },

          include: {
            booker: true,
          },
        },

        passengersList: {
          orderBy: {
            position: 'asc',
          },

          include: {
            passenger: true,
          },
        },

        vias: {
          orderBy: {
            position: 'asc',
          },
        },

        finance: true,

        bookingStatusHistories: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    /* =====================================================
       REALTIME
    ===================================================== */

    if (assignedDriverId) {
      this.websocketGateway.sendBookingToDriver(assignedDriverId, booking);
    }

    this.websocketGateway.notifyDispatchUpdate();

    return booking;
  }

  /* =====================================================
     FIND ALL BOOKINGS
  ===================================================== */

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

    /* Status filter */

    if (status) {
      where.status = status;
    }

    /* Driver filter */

    if (driverId) {
      where.assignedDriverId = driverId;
    }

    /* Search */

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

    /* Upcoming */

    if (upcoming === 'true') {
      where.pickupDatetime = {
        gte: new Date(),
      };
    }

    /* Active */

    if (active === 'true') {
      where.status = {
        in: [
          BookingStatus.ACCEPTED,
          BookingStatus.ARRIVED,
          BookingStatus.STARTED,
        ],
      };
    }

    const parsedPage = Number(page);
    const parsedLimit = Number(limit);

    const currentPage =
      Number.isFinite(parsedPage) && parsedPage > 0
        ? Math.floor(parsedPage)
        : 1;

    const perPage =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(Math.floor(parsedLimit), 100)
        : 20;

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,

        include: {
          account: true,

          assignedDriver: {
            select: {
              id: true,
              name: true,
              phone: true,
              vehicleName: true,
              vehicleNumber: true,
              status: true,
              driverType: true,
              callSign: true,
              driverGrade: true,
            },
          },

          bookers: {
            orderBy: {
              position: 'asc',
            },

            include: {
              booker: true,
            },
          },

          passengersList: {
            orderBy: {
              position: 'asc',
            },

            include: {
              passenger: true,
            },
          },

          vias: {
            orderBy: {
              position: 'asc',
            },
          },

          finance: true,

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

  /* =====================================================
     FIND ONE BOOKING
  ===================================================== */

  async findOne(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: {
        id: bookingId,
      },

      include: {
        account: true,

        assignedDriver: {
          select: {
            id: true,
            name: true,
            phone: true,
            vehicleName: true,
            vehicleNumber: true,
            status: true,
            driverType: true,
            callSign: true,
            driverGrade: true,
          },
        },

        bookers: {
          orderBy: {
            position: 'asc',
          },
          include: {
            booker: true,
          },
        },

        passengersList: {
          orderBy: {
            position: 'asc',
          },
          include: {
            passenger: true,
          },
        },

        vias: {
          orderBy: {
            position: 'asc',
          },
        },

        finance: true,

        bookingStatusHistories: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  /* =====================================================
     UPDATE BOOKING
  ===================================================== */

  async update(bookingId: string, updateBookingDto: UpdateBookingDto) {
    const existingBooking = await this.prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
      include: {
        bookers: true,
        passengersList: true,
      },
    });

    if (!existingBooking) {
      throw new NotFoundException('Booking not found');
    }

    if (
      [
        BookingStatus.COMPLETED,
        BookingStatus.CANCELLED,
        BookingStatus.REJECTED,
      ].includes(existingBooking.status as BookingStatus)
    ) {
      throw new BadRequestException(
        'Completed, cancelled or rejected bookings cannot be edited',
      );
    }

    const {
      accountId,
      assignedDriverId,
      bookers,
      passengersList,
      vias,
      finance,
      ...bookingData
    } = updateBookingDto;

    const assignmentChanged =
      assignedDriverId !== undefined &&
      assignedDriverId !== existingBooking.assignedDriverId;

    if (
      assignmentChanged &&
      ![BookingStatus.PENDING, BookingStatus.ASSIGNED].includes(
        existingBooking.status as BookingStatus,
      )
    ) {
      throw new BadRequestException(
        'Driver assignment can only be changed while a booking is Pending or Assigned',
      );
    }

    const effectiveAccountId =
      accountId === undefined ? existingBooking.accountId : accountId;

    const effectiveAssignedDriverId =
      assignedDriverId === undefined
        ? existingBooking.assignedDriverId
        : assignedDriverId;

    const effectivePickupDatetime =
      bookingData.pickupDatetime !== undefined
        ? new Date(bookingData.pickupDatetime)
        : existingBooking.pickupDatetime;

    const effectiveEstimatedDuration =
      bookingData.estimatedDurationMinutes ??
      existingBooking.estimatedDurationMinutes;

    /* =====================================================
       ACCOUNT VALIDATION
    ===================================================== */

    const accountChanged =
      accountId !== undefined && accountId !== existingBooking.accountId;

    if (effectiveAccountId && accountChanged) {
      const account = await this.prisma.clientAccount.findUnique({
        where: {
          id: effectiveAccountId,
        },
        select: {
          id: true,
          isActive: true,
        },
      });

      if (!account) {
        throw new BadRequestException('Client account not found');
      }

      if (!account.isActive) {
        throw new BadRequestException('Client account is inactive');
      }
    }

    /* =====================================================
       BOOKER VALIDATION
    ===================================================== */

    const effectiveBookers =
      bookers !== undefined
        ? bookers
        : existingBooking.bookers.map((item) => ({
            bookerId: item.bookerId,
            isPrimary: item.isPrimary,
            position: item.position,
          }));

    if (effectiveBookers.length > 0) {
      const bookerIds = effectiveBookers.map((item) => item.bookerId);
      const uniqueBookerIds = [...new Set(bookerIds)];

      if (uniqueBookerIds.length !== bookerIds.length) {
        throw new BadRequestException('Duplicate bookers are not allowed');
      }

      const existingBookers = await this.prisma.booker.findMany({
        where: {
          id: {
            in: uniqueBookerIds,
          },
        },
        select: {
          id: true,
          accountId: true,
        },
      });

      if (existingBookers.length !== uniqueBookerIds.length) {
        throw new BadRequestException(
          'One or more selected bookers could not be found',
        );
      }

      if (effectiveAccountId) {
        const invalidBooker = existingBookers.find(
          (booker) =>
            booker.accountId && booker.accountId !== effectiveAccountId,
        );

        if (invalidBooker) {
          throw new BadRequestException(
            'One or more selected bookers belong to a different client account',
          );
        }
      }
    }

    /* =====================================================
       PASSENGER VALIDATION
    ===================================================== */

    const effectivePassengers =
      passengersList !== undefined
        ? passengersList
        : existingBooking.passengersList.map((item) => ({
            passengerId: item.passengerId,
            isPrimary: item.isPrimary,
            position: item.position,
          }));

    if (effectivePassengers.length > 0) {
      const passengerIds = effectivePassengers.map((item) => item.passengerId);
      const uniquePassengerIds = [...new Set(passengerIds)];

      if (uniquePassengerIds.length !== passengerIds.length) {
        throw new BadRequestException('Duplicate passengers are not allowed');
      }

      const existingPassengers = await this.prisma.passenger.findMany({
        where: {
          id: {
            in: uniquePassengerIds,
          },
        },
        select: {
          id: true,
          accountId: true,
        },
      });

      if (existingPassengers.length !== uniquePassengerIds.length) {
        throw new BadRequestException(
          'One or more selected passengers could not be found',
        );
      }

      if (effectiveAccountId) {
        const invalidPassenger = existingPassengers.find(
          (passenger) =>
            passenger.accountId && passenger.accountId !== effectiveAccountId,
        );

        if (invalidPassenger) {
          throw new BadRequestException(
            'One or more selected passengers belong to a different client account',
          );
        }
      }
    }

    /* =====================================================
       DRIVER VALIDATION + CONFLICT CHECK
    ===================================================== */

    if (assignmentChanged && assignedDriverId) {
      const driver = await this.prisma.driver.findUnique({
        where: {
          id: assignedDriverId,
        },
      });

      if (!driver) {
        throw new BadRequestException('Driver not found');
      }

      if (driver.status === DriverStatus.INACTIVE) {
        throw new BadRequestException('Driver is inactive');
      }
    }

    const scheduleChanged =
      bookingData.pickupDatetime !== undefined ||
      bookingData.estimatedDurationMinutes !== undefined;

    if (effectiveAssignedDriverId && (assignmentChanged || scheduleChanged)) {
      const hasConflict = await this.hasDriverConflict(
        effectiveAssignedDriverId,
        effectivePickupDatetime,
        effectiveEstimatedDuration,
        bookingId,
      );

      if (hasConflict) {
        throw new BadRequestException(
          'Driver has conflicting booking schedule',
        );
      }
    }

    /* =====================================================
       SCALAR UPDATE DATA
    ===================================================== */

    const data: any = {};

    if (bookingData.customerName !== undefined) {
      const value = bookingData.customerName.trim();
      if (!value) {
        throw new BadRequestException('Customer name cannot be empty');
      }
      data.customerName = value;
    }

    if (bookingData.customerPhone !== undefined) {
      const value = bookingData.customerPhone.trim();
      if (!value) {
        throw new BadRequestException('Customer phone cannot be empty');
      }
      data.customerPhone = value;
    }

    if (bookingData.customerEmail !== undefined) {
      data.customerEmail = bookingData.customerEmail?.trim() || null;
    }

    if (accountId !== undefined) {
      data.account = accountId
        ? {
            connect: {
              id: accountId,
            },
          }
        : {
            disconnect: true,
          };
    }

    if (bookingData.costCenter !== undefined) {
      data.costCenter = bookingData.costCenter?.trim() || null;
    }

    if (bookingData.invoiceRef !== undefined) {
      data.invoiceRef = bookingData.invoiceRef?.trim() || null;
    }

    if (bookingData.jobStatus !== undefined) {
      data.jobStatus = bookingData.jobStatus?.trim() || null;
    }

    if (bookingData.salesman !== undefined) {
      data.salesman = bookingData.salesman?.trim() || null;
    }

    if (bookingData.nameCardOverride !== undefined) {
      data.nameCardOverride = bookingData.nameCardOverride?.trim() || null;
    }

    if (bookingData.nameCardFileUrl !== undefined) {
      data.nameCardFileUrl = bookingData.nameCardFileUrl?.trim() || null;
    }

    if (bookingData.pickupAddress !== undefined) {
      const value = bookingData.pickupAddress.trim();
      if (!value) {
        throw new BadRequestException('Pickup address cannot be empty');
      }
      data.pickupAddress = value;
    }

    if (bookingData.dropoffAddress !== undefined) {
      const value = bookingData.dropoffAddress.trim();
      if (!value) {
        throw new BadRequestException('Drop-off address cannot be empty');
      }
      data.dropoffAddress = value;
    }

    if (bookingData.pickupDatetime !== undefined) {
      data.pickupDatetime = new Date(bookingData.pickupDatetime);
    }

    if (bookingData.journeyType !== undefined) {
      data.journeyType = bookingData.journeyType?.trim() || null;
    }

    if (bookingData.passengers !== undefined) {
      data.passengers = bookingData.passengers;
    }

    if (bookingData.luggage !== undefined) {
      data.luggage = bookingData.luggage;
    }

    if (bookingData.bigLuggage !== undefined) {
      data.bigLuggage = bookingData.bigLuggage;
    }

    if (bookingData.smallLuggage !== undefined) {
      data.smallLuggage = bookingData.smallLuggage;
    }

    if (bookingData.babySeats !== undefined) {
      data.babySeats = bookingData.babySeats;
    }

    if (bookingData.childSeats !== undefined) {
      data.childSeats = bookingData.childSeats;
    }

    if (bookingData.boosterSeats !== undefined) {
      data.boosterSeats = bookingData.boosterSeats;
    }

    if (bookingData.notes !== undefined) {
      data.notes = bookingData.notes?.trim() || null;
    }

    if (bookingData.driverNote !== undefined) {
      data.driverNote = bookingData.driverNote?.trim() || null;
    }

    if (bookingData.preferredVehicleCategory !== undefined) {
      data.preferredVehicleCategory =
        bookingData.preferredVehicleCategory?.trim() || null;
    }

    if (bookingData.requestedDriverType !== undefined) {
      data.requestedDriverType =
        bookingData.requestedDriverType?.trim() || null;
    }

    if (bookingData.routeDistanceMeters !== undefined) {
      data.routeDistanceMeters = bookingData.routeDistanceMeters;
    }

    if (bookingData.routeDurationSeconds !== undefined) {
      data.routeDurationSeconds = bookingData.routeDurationSeconds;
    }

    if (bookingData.estimatedDurationMinutes !== undefined) {
      data.estimatedDurationMinutes = bookingData.estimatedDurationMinutes;
    }

    if (assignmentChanged) {
      data.assignedDriver = assignedDriverId
        ? {
            connect: {
              id: assignedDriverId,
            },
          }
        : {
            disconnect: true,
          };

      data.status = assignedDriverId
        ? BookingStatus.ASSIGNED
        : BookingStatus.PENDING;
    }

    /* =====================================================
       TRANSACTIONAL RELATION UPDATE
    ===================================================== */

    const updatedBooking = await this.prisma.$transaction(async (tx) => {
      if (bookers !== undefined) {
        await tx.bookingBooker.deleteMany({
          where: {
            bookingId,
          },
        });

        if (bookers.length > 0) {
          await tx.bookingBooker.createMany({
            data: bookers.map((item, index) => ({
              bookingId,
              bookerId: item.bookerId,
              isPrimary: item.isPrimary ?? index === 0,
              position: item.position ?? index,
            })),
          });
        }
      }

      if (passengersList !== undefined) {
        await tx.bookingPassenger.deleteMany({
          where: {
            bookingId,
          },
        });

        if (passengersList.length > 0) {
          await tx.bookingPassenger.createMany({
            data: passengersList.map((item, index) => ({
              bookingId,
              passengerId: item.passengerId,
              isPrimary: item.isPrimary ?? index === 0,
              position: item.position ?? index,
            })),
          });
        }
      }

      if (vias !== undefined) {
        await tx.bookingVia.deleteMany({
          where: {
            bookingId,
          },
        });

        if (vias.length > 0) {
          await tx.bookingVia.createMany({
            data: vias.map((via, index) => ({
              bookingId,
              address: via.address.trim(),
              position: via.position ?? index,
              latitude: via.latitude,
              longitude: via.longitude,
            })),
          });
        }
      }

      if (finance !== undefined) {
        await tx.bookingFinance.upsert({
          where: {
            bookingId,
          },
          create: {
            bookingId,
            clientQuote: finance.clientQuote,
            clientWaitingCharge: finance.clientWaitingCharge,
            clientParking: finance.clientParking,
            clientCongestion: finance.clientCongestion,
            clientDiscount: finance.clientDiscount,
            clientTotal: finance.clientTotal,
            clientAdminFee: finance.clientAdminFee,
            clientNet: finance.clientNet,
            clientVat: finance.clientVat,
            clientVatPercent: finance.clientVatPercent,
            clientTotalAmount: finance.clientTotalAmount,
            clientWaitingIncluded: finance.clientWaitingIncluded ?? false,
            clientParkingIncluded: finance.clientParkingIncluded ?? false,
            clientPriceOverride: finance.clientPriceOverride ?? false,
            driverCost: finance.driverCost,
            driverWaitingPay: finance.driverWaitingPay,
            driverParking: finance.driverParking,
            driverCongestion: finance.driverCongestion,
            driverTotal: finance.driverTotal,
            driverWaitingIncluded: finance.driverWaitingIncluded ?? false,
            driverParkingIncluded: finance.driverParkingIncluded ?? false,
            driverPayAsStandard: finance.driverPayAsStandard ?? false,
            driverPriceOverride: finance.driverPriceOverride ?? false,
            paymentType: finance.paymentType?.trim() || null,
            financeNote: finance.financeNote?.trim() || null,
            invoiceNote: finance.invoiceNote?.trim() || null,
            extraNote: finance.extraNote?.trim() || null,
          },
          update: {
            clientQuote: finance.clientQuote,
            clientWaitingCharge: finance.clientWaitingCharge,
            clientParking: finance.clientParking,
            clientCongestion: finance.clientCongestion,
            clientDiscount: finance.clientDiscount,
            clientTotal: finance.clientTotal,
            clientAdminFee: finance.clientAdminFee,
            clientNet: finance.clientNet,
            clientVat: finance.clientVat,
            clientVatPercent: finance.clientVatPercent,
            clientTotalAmount: finance.clientTotalAmount,
            clientWaitingIncluded: finance.clientWaitingIncluded,
            clientParkingIncluded: finance.clientParkingIncluded,
            clientPriceOverride: finance.clientPriceOverride,
            driverCost: finance.driverCost,
            driverWaitingPay: finance.driverWaitingPay,
            driverParking: finance.driverParking,
            driverCongestion: finance.driverCongestion,
            driverTotal: finance.driverTotal,
            driverWaitingIncluded: finance.driverWaitingIncluded,
            driverParkingIncluded: finance.driverParkingIncluded,
            driverPayAsStandard: finance.driverPayAsStandard,
            driverPriceOverride: finance.driverPriceOverride,
            paymentType:
              finance.paymentType !== undefined
                ? finance.paymentType?.trim() || null
                : undefined,
            financeNote:
              finance.financeNote !== undefined
                ? finance.financeNote?.trim() || null
                : undefined,
            invoiceNote:
              finance.invoiceNote !== undefined
                ? finance.invoiceNote?.trim() || null
                : undefined,
            extraNote:
              finance.extraNote !== undefined
                ? finance.extraNote?.trim() || null
                : undefined,
          },
        });
      }

      if (Object.keys(data).length > 0) {
        await tx.booking.update({
          where: {
            id: bookingId,
          },
          data,
        });
      }

      if (assignmentChanged) {
        let notes = 'Driver assignment updated during booking edit';

        if (!existingBooking.assignedDriverId && assignedDriverId) {
          notes = 'Driver assigned during booking edit';
        } else if (existingBooking.assignedDriverId && !assignedDriverId) {
          notes = 'Driver unassigned during booking edit';
        } else if (
          existingBooking.assignedDriverId &&
          assignedDriverId &&
          existingBooking.assignedDriverId !== assignedDriverId
        ) {
          notes = 'Driver reassigned during booking edit';
        }

        await tx.bookingStatusHistory.create({
          data: {
            bookingId,
            status: assignedDriverId
              ? BookingStatus.ASSIGNED
              : BookingStatus.PENDING,
            notes,
          },
        });
      }

      const result = await tx.booking.findUnique({
        where: {
          id: bookingId,
        },
        include: {
          account: true,

          assignedDriver: {
            select: {
              id: true,
              name: true,
              phone: true,
              vehicleName: true,
              vehicleNumber: true,
              status: true,
              driverType: true,
              callSign: true,
              driverGrade: true,
            },
          },

          bookers: {
            orderBy: {
              position: 'asc',
            },
            include: {
              booker: true,
            },
          },

          passengersList: {
            orderBy: {
              position: 'asc',
            },
            include: {
              passenger: true,
            },
          },

          vias: {
            orderBy: {
              position: 'asc',
            },
          },

          finance: true,

          bookingStatusHistories: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });

      if (!result) {
        throw new BadRequestException('Booking not found after update');
      }

      return result;
    });

    if (effectiveAssignedDriverId) {
      this.websocketGateway.sendBookingToDriver(
        effectiveAssignedDriverId,
        updatedBooking,
      );
    }

    this.websocketGateway.notifyDispatchUpdate();

    return updatedBooking;
  }

  /* =====================================================
     DRIVER CONFLICT CHECK
  ===================================================== */

  async hasDriverConflict(
    driverId: string,
    pickupDatetime: Date,
    estimatedDurationMinutes: number,
    excludeBookingId?: string,
  ) {
    const requestedStart = new Date(pickupDatetime);

    const requestedEnd = new Date(
      requestedStart.getTime() + estimatedDurationMinutes * 60 * 1000,
    );

    const existingBookings = await this.prisma.booking.findMany({
      where: {
        assignedDriverId: driverId,

        ...(excludeBookingId
          ? {
              id: {
                not: excludeBookingId,
              },
            }
          : {}),

        status: {
          in: [
            BookingStatus.ASSIGNED,
            BookingStatus.ACCEPTED,
            BookingStatus.ARRIVED,
            BookingStatus.STARTED,
          ],
        },
      },
    });

    for (const booking of existingBookings) {
      const existingStart = new Date(booking.pickupDatetime);

      const existingEnd = new Date(
        existingStart.getTime() + booking.estimatedDurationMinutes * 60 * 1000,
      );

      const overlap =
        requestedStart < existingEnd && requestedEnd > existingStart;

      if (overlap) {
        return true;
      }
    }

    return false;
  }

  /* =====================================================
     ASSIGN DRIVER
  ===================================================== */

  async assignDriver(bookingId: string, assignDriverDto: AssignDriverDto) {
    const { driverId } = assignDriverDto;

    const booking = await this.prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (
      ![BookingStatus.PENDING, BookingStatus.ASSIGNED].includes(
        booking.status as BookingStatus,
      )
    ) {
      throw new BadRequestException(
        'Driver assignment can only be changed while a booking is Pending or Assigned',
      );
    }

    if (
      booking.status === BookingStatus.ASSIGNED &&
      booking.assignedDriverId === driverId
    ) {
      return this.findOne(bookingId);
    }

    const driver = await this.prisma.driver.findUnique({
      where: {
        id: driverId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (driver.status === DriverStatus.INACTIVE) {
      throw new BadRequestException('Driver is inactive');
    }

    const hasConflict = await this.hasDriverConflict(
      driverId,
      booking.pickupDatetime,
      booking.estimatedDurationMinutes,
      bookingId,
    );

    if (hasConflict) {
      throw new BadRequestException('Driver has conflicting booking schedule');
    }

    const previousDriverId = booking.assignedDriverId;

    const updatedBooking = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: {
          id: bookingId,
        },
        data: {
          assignedDriverId: driverId,
          status: BookingStatus.ASSIGNED,
        },
        include: {
          assignedDriver: {
            select: safeAssignedDriverSelect,
          },
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          status: BookingStatus.ASSIGNED,
          notes:
            previousDriverId && previousDriverId !== driverId
              ? 'Driver reassigned'
              : 'Driver assigned',
        },
      });

      return updated;
    });

    this.websocketGateway.sendBookingToDriver(driverId, updatedBooking);
    this.websocketGateway.notifyDispatchUpdate();

    return updatedBooking;
  }

  /* =====================================================
     GENERIC STATUS UPDATE

     Kept for compatibility with any internal callers.
     Lifecycle controller routes below do not use this method.
  ===================================================== */

  async updateBookingStatus(bookingId: string, status: BookingStatus) {
    const booking = await this.prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        id: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return this.prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        status,
      },
    });
  }

  /* =====================================================
     ACCEPT BOOKING
     ASSIGNED -> ACCEPTED
  ===================================================== */

  async acceptBooking(bookingId: string) {
    const existingBooking = await this.prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        id: true,
        status: true,
        assignedDriverId: true,
      },
    });

    if (!existingBooking) {
      throw new NotFoundException('Booking not found');
    }

    if (existingBooking.status !== BookingStatus.ASSIGNED) {
      throw new BadRequestException(
        'Booking can only be accepted when it is Assigned',
      );
    }

    if (!existingBooking.assignedDriverId) {
      throw new BadRequestException(
        'Booking must have an assigned driver before it can be accepted',
      );
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: {
          id: bookingId,
        },
        data: {
          status: BookingStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          status: BookingStatus.ACCEPTED,
          notes: 'Driver accepted booking',
        },
      });

      return updated;
    });

    this.websocketGateway.notifyDispatchUpdate();

    return booking;
  }

  /* =====================================================
     ARRIVED
     ACCEPTED -> ARRIVED
  ===================================================== */

  async arrivedBooking(bookingId: string) {
    const existingBooking = await this.prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        id: true,
        status: true,
        assignedDriverId: true,
        assignedDriver: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!existingBooking) {
      throw new NotFoundException('Booking not found');
    }

    if (existingBooking.status !== BookingStatus.ACCEPTED) {
      throw new BadRequestException(
        'Booking can only be marked Arrived after it has been Accepted',
      );
    }

    if (!existingBooking.assignedDriverId) {
      throw new BadRequestException(
        'Booking must have an assigned driver before arrival',
      );
    }

    if (existingBooking.assignedDriver?.status === DriverStatus.INACTIVE) {
      throw new BadRequestException('Assigned driver is inactive');
    }

    const updatedBooking = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: {
          id: bookingId,
        },
        data: {
          status: BookingStatus.ARRIVED,
          arrivedAt: new Date(),
        },
      });

      await tx.driver.update({
        where: {
          id: existingBooking.assignedDriverId!,
        },
        data: {
          status: DriverStatus.BUSY,
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          status: BookingStatus.ARRIVED,
          notes: 'Driver arrived at pickup location',
        },
      });

      return updated;
    });

    this.websocketGateway.notifyDispatchUpdate();

    return updatedBooking;
  }

  /* =====================================================
     START BOOKING
     ARRIVED -> STARTED
  ===================================================== */

  async startBooking(bookingId: string) {
    const existingBooking = await this.prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        id: true,
        status: true,
        assignedDriverId: true,
        assignedDriver: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!existingBooking) {
      throw new NotFoundException('Booking not found');
    }

    if (existingBooking.status !== BookingStatus.ARRIVED) {
      throw new BadRequestException(
        'Booking can only be started after the driver has Arrived',
      );
    }

    if (!existingBooking.assignedDriverId) {
      throw new BadRequestException(
        'Booking must have an assigned driver before it can start',
      );
    }

    if (existingBooking.assignedDriver?.status === DriverStatus.INACTIVE) {
      throw new BadRequestException('Assigned driver is inactive');
    }

    const updatedBooking = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: {
          id: bookingId,
        },
        data: {
          status: BookingStatus.STARTED,
          startedAt: new Date(),
        },
      });

      await tx.driver.update({
        where: {
          id: existingBooking.assignedDriverId!,
        },
        data: {
          status: DriverStatus.BUSY,
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          status: BookingStatus.STARTED,
          notes: 'Journey started',
        },
      });

      return updated;
    });

    this.websocketGateway.notifyDispatchUpdate();

    return updatedBooking;
  }

  /* =====================================================
     COMPLETE BOOKING
     STARTED -> COMPLETED
  ===================================================== */

  async completeBooking(bookingId: string) {
    const existingBooking = await this.prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        id: true,
        status: true,
        assignedDriverId: true,
      },
    });

    if (!existingBooking) {
      throw new NotFoundException('Booking not found');
    }

    if (existingBooking.status !== BookingStatus.STARTED) {
      throw new BadRequestException(
        'Booking can only be completed after the journey has Started',
      );
    }

    if (!existingBooking.assignedDriverId) {
      throw new BadRequestException(
        'Booking must have an assigned driver before it can be completed',
      );
    }

    const updatedBooking = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: {
          id: bookingId,
        },
        data: {
          status: BookingStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          status: BookingStatus.COMPLETED,
          notes: 'Trip completed',
        },
      });

      const otherActiveBooking = await tx.booking.findFirst({
        where: {
          id: {
            not: bookingId,
          },
          assignedDriverId: existingBooking.assignedDriverId!,
          status: {
            in: [BookingStatus.ARRIVED, BookingStatus.STARTED],
          },
        },
        select: {
          id: true,
        },
      });

      const driver = await tx.driver.findUnique({
        where: {
          id: existingBooking.assignedDriverId!,
        },
        select: {
          status: true,
        },
      });

      if (driver && driver.status !== DriverStatus.INACTIVE) {
        await tx.driver.update({
          where: {
            id: existingBooking.assignedDriverId!,
          },
          data: {
            status: otherActiveBooking
              ? DriverStatus.BUSY
              : DriverStatus.AVAILABLE,
          },
        });
      }

      return updated;
    });

    this.websocketGateway.notifyDispatchUpdate();

    return updatedBooking;
  }

  /* =====================================================
     REJECT BOOKING
     ASSIGNED -> REJECTED

     Rejection does not change the driver's live availability.
     Assignment itself never makes a driver BUSY.
  ===================================================== */

  async rejectBooking(bookingId: string) {
    const existingBooking = await this.prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        id: true,
        status: true,
        assignedDriverId: true,
      },
    });

    if (!existingBooking) {
      throw new NotFoundException('Booking not found');
    }

    if (existingBooking.status !== BookingStatus.ASSIGNED) {
      throw new BadRequestException(
        'Booking can only be rejected while it is Assigned',
      );
    }

    if (!existingBooking.assignedDriverId) {
      throw new BadRequestException(
        'Booking does not have an assigned driver to reject it',
      );
    }

    const updatedBooking = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: {
          id: bookingId,
        },
        data: {
          status: BookingStatus.REJECTED,
          rejectedAt: new Date(),
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          status: BookingStatus.REJECTED,
          notes: 'Driver rejected booking',
        },
      });

      return updated;
    });

    this.websocketGateway.notifyDispatchUpdate();

    return updatedBooking;
  }

  /* =====================================================
     CANCEL BOOKING

     Allowed before a journey has actually started.
     If cancellation happens after ARRIVED, the driver's BUSY
     state is safely released unless another active trip exists.
  ===================================================== */

  async cancelBooking(bookingId: string) {
    const existingBooking = await this.prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        id: true,
        status: true,
        assignedDriverId: true,
      },
    });

    if (!existingBooking) {
      throw new NotFoundException('Booking not found');
    }

    const cancellableStatuses: BookingStatus[] = [
      BookingStatus.PENDING,
      BookingStatus.ASSIGNED,
      BookingStatus.ACCEPTED,
      BookingStatus.ARRIVED,
    ];

    if (
      !cancellableStatuses.includes(existingBooking.status as BookingStatus)
    ) {
      throw new BadRequestException(
        'Booking cannot be cancelled in its current status',
      );
    }

    const updatedBooking = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: {
          id: bookingId,
        },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          status: BookingStatus.CANCELLED,
          notes: 'Booking cancelled',
        },
      });

      if (
        existingBooking.status === BookingStatus.ARRIVED &&
        existingBooking.assignedDriverId
      ) {
        const otherActiveBooking = await tx.booking.findFirst({
          where: {
            id: {
              not: bookingId,
            },
            assignedDriverId: existingBooking.assignedDriverId,
            status: {
              in: [BookingStatus.ARRIVED, BookingStatus.STARTED],
            },
          },
          select: {
            id: true,
          },
        });

        const driver = await tx.driver.findUnique({
          where: {
            id: existingBooking.assignedDriverId,
          },
          select: {
            status: true,
          },
        });

        if (driver && driver.status !== DriverStatus.INACTIVE) {
          await tx.driver.update({
            where: {
              id: existingBooking.assignedDriverId,
            },
            data: {
              status: otherActiveBooking
                ? DriverStatus.BUSY
                : DriverStatus.AVAILABLE,
            },
          });
        }
      }

      return updated;
    });

    this.websocketGateway.notifyDispatchUpdate();

    return updatedBooking;
  }
}
