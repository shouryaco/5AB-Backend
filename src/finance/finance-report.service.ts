import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import {
  BookingStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const LONDON_TIME_ZONE = 'Europe/London';

@Injectable()
export class FinanceReportService {
  constructor(private readonly prisma: PrismaService) {}

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private londonLocalToUtc(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
    millisecond = 0,
  ) {
    const desiredUtcLike = Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second,
      millisecond,
    );

    let guess = desiredUtcLike;

    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: LONDON_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });

    for (let i = 0; i < 3; i += 1) {
      const parts = formatter.formatToParts(new Date(guess));

      const map = Object.fromEntries(
        parts
          .filter((part) => part.type !== 'literal')
          .map((part) => [part.type, part.value]),
      );

      const representedAsUtc = Date.UTC(
        Number(map.year),
        Number(map.month) - 1,
        Number(map.day),
        Number(map.hour),
        Number(map.minute),
        Number(map.second),
        millisecond,
      );

      const offset = representedAsUtc - guess;
      guess = desiredUtcLike - offset;
    }

    return new Date(guess);
  }

  private parseMonth(month: string) {
    const [yearString, monthString] = month.split('-');

    const year = Number(yearString);
    const monthNumber = Number(monthString);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(monthNumber) ||
      monthNumber < 1 ||
      monthNumber > 12
    ) {
      throw new BadRequestException('Month must be in YYYY-MM format');
    }

    const nextMonthNumber = monthNumber === 12 ? 1 : monthNumber + 1;
    const nextMonthYear = monthNumber === 12 ? year + 1 : year;

    return {
      start: this.londonLocalToUtc(year, monthNumber, 1),
      endExclusive: this.londonLocalToUtc(
        nextMonthYear,
        nextMonthNumber,
        1,
      ),
    };
  }

  private parseDate(value: string, label: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
      throw new BadRequestException(
        `${label} must be in YYYY-MM-DD format`,
      );
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException(`Invalid ${label}`);
    }

    return {
      year,
      month,
      day,
    };
  }

  private getDateBounds(
    month?: string,
    from?: string,
    to?: string,
  ) {
    if (from || to) {
      let start: Date | undefined;
      let endExclusive: Date | undefined;

      if (from) {
        const date = this.parseDate(from, 'from date');

        start = this.londonLocalToUtc(
          date.year,
          date.month,
          date.day,
        );
      }

      if (to) {
        const date = this.parseDate(to, 'to date');

        const nextDay = new Date(
          Date.UTC(
            date.year,
            date.month - 1,
            date.day + 1,
          ),
        );

        endExclusive = this.londonLocalToUtc(
          nextDay.getUTCFullYear(),
          nextDay.getUTCMonth() + 1,
          nextDay.getUTCDate(),
        );
      }

      if (
        start &&
        endExclusive &&
        start.getTime() >= endExclusive.getTime()
      ) {
        throw new BadRequestException(
          'From date must be before or equal to To date',
        );
      }

      return {
        start,
        endExclusive,
      };
    }

    if (month) {
      return this.parseMonth(month);
    }

    return {};
  }

  private getPrimaryName<T extends { isPrimary: boolean; position: number }>(
    rows: T[],
    getName: (row: T) => string,
  ) {
    if (!rows.length) return null;

    const sorted = [...rows].sort(
      (a, b) => a.position - b.position,
    );

    const primary = sorted.find((row) => row.isPrimary);

    return getName(primary ?? sorted[0]);
  }

  async getReport(params: {
    month?: string;
    from?: string;
    to?: string;
    accountId?: string;
    driverId?: string;
    vehicle?: string;
    search?: string;
  }) {
    const { start, endExclusive } = this.getDateBounds(
      params.month,
      params.from,
      params.to,
    );

    const cleanVehicle = params.vehicle?.trim();
    const cleanSearch = params.search?.trim();

    const where: Prisma.BookingWhereInput = {
      status: BookingStatus.COMPLETED,

      ...(start || endExclusive
        ? {
            pickupDatetime: {
              ...(start ? { gte: start } : {}),
              ...(endExclusive
                ? { lt: endExclusive }
                : {}),
            },
          }
        : {}),

      ...(params.accountId?.trim()
        ? {
            accountId: params.accountId.trim(),
          }
        : {}),

      ...(params.driverId?.trim()
        ? {
            assignedDriverId: params.driverId.trim(),
          }
        : {}),

      ...(cleanVehicle
        ? {
            assignedDriver: {
              is: {
                vehicleName: {
                  equals: cleanVehicle,
                  mode: 'insensitive',
                },
              },
            },
          }
        : {}),

      ...(cleanSearch
        ? {
            OR: [
              {
                bookingReference: {
                  contains: cleanSearch,
                  mode: 'insensitive',
                },
              },
              {
                customerName: {
                  contains: cleanSearch,
                  mode: 'insensitive',
                },
              },
              {
                pickupAddress: {
                  contains: cleanSearch,
                  mode: 'insensitive',
                },
              },
              {
                dropoffAddress: {
                  contains: cleanSearch,
                  mode: 'insensitive',
                },
              },
              {
                account: {
                  is: {
                    name: {
                      contains: cleanSearch,
                      mode: 'insensitive',
                    },
                  },
                },
              },
              {
                assignedDriver: {
                  is: {
                    name: {
                      contains: cleanSearch,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const bookings = await this.prisma.booking.findMany({
      where,

      include: {
        account: {
          select: {
            id: true,
            name: true,
          },
        },

        assignedDriver: {
          select: {
            id: true,
            name: true,
            callSign: true,
            vehicleName: true,
            vehicleNumber: true,
          },
        },

        bookers: {
          orderBy: {
            position: 'asc',
          },
          include: {
            booker: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },

        passengersList: {
          orderBy: {
            position: 'asc',
          },
          include: {
            passenger: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },

        finance: true,
      },

      orderBy: {
        pickupDatetime: 'asc',
      },
    });

    const rows = bookings.map((booking) => {
      const finance = booking.finance;

      const vat = this.roundMoney(
        finance?.clientVat ?? 0,
      );

      const revenue = this.roundMoney(
        finance?.clientNet ??
          Math.max(
            (finance?.clientTotalAmount ?? 0) - vat,
            0,
          ),
      );

      const calculatedDriverCost = this.roundMoney(
        (finance?.driverCost ?? 0) +
          (finance?.driverWaitingPay ?? 0) +
          (finance?.driverParking ?? 0) +
          (finance?.driverCongestion ?? 0),
      );

      const cost = this.roundMoney(
        finance?.driverTotal ?? calculatedDriverCost,
      );

      const margin = this.roundMoney(
        revenue - cost,
      );

      const marginPercent =
        revenue > 0
          ? this.roundMoney((margin / revenue) * 100)
          : 0;

      const primaryBooker = this.getPrimaryName(
        booking.bookers,
        (row) => row.booker.name,
      );

      const primaryPassenger = this.getPrimaryName(
        booking.passengersList,
        (row) => row.passenger.name,
      );

      const needsReview =
        !finance ||
        finance.clientTotalAmount === null ||
        finance.driverTotal === null ||
        finance.clientPriceOverride ||
        finance.driverPriceOverride;

      return {
        id: booking.id,
        bookingReference: booking.bookingReference,

        pickupDatetime: booking.pickupDatetime,
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,

        booker: primaryBooker,
        passenger:
          primaryPassenger ?? booking.customerName,

        account: booking.account,

        driver: booking.assignedDriver,

        requestedVehicle:
          booking.preferredVehicleCategory,

        vehicleName:
          booking.assignedDriver?.vehicleName ??
          booking.preferredVehicleCategory ??
          null,

        vehicleNumber:
          booking.assignedDriver?.vehicleNumber ?? null,

        paymentType:
          finance?.paymentType ?? null,

        cashJob:
          finance?.paymentType
            ?.trim()
            .toUpperCase() === 'CASH',

        review: needsReview,

        revenue,
        cost,
        vat,

        margin,
        marginPercent,

        fleetShare: null,
      };
    });

    const summary = rows.reduce(
      (totals, row) => {
        totals.revenue += row.revenue;
        totals.cost += row.cost;
        totals.vat += row.vat;
        totals.margin += row.margin;

        if (row.review) {
          totals.reviewCount += 1;
        }

        if (row.cashJob) {
          totals.cashJobCount += 1;
        }

        return totals;
      },
      {
        revenue: 0,
        cost: 0,
        vat: 0,
        margin: 0,
        reviewCount: 0,
        cashJobCount: 0,
      },
    );

    summary.revenue = this.roundMoney(summary.revenue);
    summary.cost = this.roundMoney(summary.cost);
    summary.vat = this.roundMoney(summary.vat);
    summary.margin = this.roundMoney(summary.margin);

    const marginPercent =
      summary.revenue > 0
        ? this.roundMoney(
            (summary.margin / summary.revenue) * 100,
          )
        : 0;

    return {
      data: rows,

      summary: {
        bookingCount: rows.length,
        ...summary,
        marginPercent,
      },
    };
  }
}
