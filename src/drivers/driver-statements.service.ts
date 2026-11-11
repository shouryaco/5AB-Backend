import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  BookingStatus,
  DriverStatementStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const LONDON_TIME_ZONE = 'Europe/London';

@Injectable()
export class DriverStatementsService {
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

  private getLondonMonthBounds(month: string) {
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

    const start = this.londonLocalToUtc(year, monthNumber, 1);
    const endExclusive = this.londonLocalToUtc(
      nextMonthYear,
      nextMonthNumber,
      1,
    );

    return {
      year,
      monthNumber,
      start,
      endExclusive,
      periodEnd: new Date(endExclusive.getTime() - 1),
    };
  }

  private async getDriver(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        callSign: true,
        vatRegistered: true,
        vatPercent: true,
        statementCycle: true,
        paymentCycle: true,
        paymentDueDate: true,
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    return driver;
  }

  private getDriverFinance(finance: {
    driverCost: number | null;
    driverWaitingPay: number | null;
    driverParking: number | null;
    driverCongestion: number | null;
    driverTotal: number | null;
  }) {
    const driverCost = this.roundMoney(finance.driverCost ?? 0);
    const driverWaitingPay = this.roundMoney(finance.driverWaitingPay ?? 0);
    const driverParking = this.roundMoney(finance.driverParking ?? 0);
    const driverCongestion = this.roundMoney(finance.driverCongestion ?? 0);

    const calculatedTotal = this.roundMoney(
      driverCost + driverWaitingPay + driverParking + driverCongestion,
    );

    const netAmount = this.roundMoney(
      finance.driverTotal ?? calculatedTotal,
    );

    return {
      driverCost,
      driverWaitingPay,
      driverParking,
      driverCongestion,
      netAmount,
    };
  }

  private async generateStatementNumber(month: string) {
    const { year, monthNumber } = this.getLondonMonthBounds(month);

    const prefix = new Intl.DateTimeFormat('en-GB', {
      month: 'short',
      timeZone: 'UTC',
    })
      .format(new Date(Date.UTC(year, monthNumber - 1, 1)))
      .replace('.', '')
      .toUpperCase();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const statementNumber = `${prefix}${year}${suffix}`;

      const existing = await this.prisma.driverStatement.findUnique({
        where: { statementNumber },
        select: { id: true },
      });

      if (!existing) {
        return statementNumber;
      }
    }

    throw new ConflictException(
      'Unable to generate a unique statement number',
    );
  }

  async preview(driverId: string, month: string) {
    const driver = await this.getDriver(driverId);
    const { start, endExclusive, periodEnd } =
      this.getLondonMonthBounds(month);

    const bookings = await this.prisma.booking.findMany({
      where: {
        assignedDriverId: driverId,
        status: BookingStatus.COMPLETED,
        pickupDatetime: {
          gte: start,
          lt: endExclusive,
        },
        driverStatementItem: {
          is: null,
        },
        finance: {
          isNot: null,
        },
      },
      select: {
        id: true,
        bookingReference: true,
        pickupDatetime: true,
        pickupAddress: true,
        dropoffAddress: true,
        customerName: true,
        journeyType: true,
        finance: {
          select: {
            driverCost: true,
            driverWaitingPay: true,
            driverParking: true,
            driverCongestion: true,
            driverTotal: true,
          },
        },
      },
      orderBy: {
        pickupDatetime: 'asc',
      },
    });

    const vatPercent = driver.vatRegistered
      ? this.roundMoney(driver.vatPercent ?? 20)
      : 0;

    const rows = bookings.map((booking) => {
      const finance = this.getDriverFinance(booking.finance!);

      const vatAmount = this.roundMoney(
        driver.vatRegistered
          ? (finance.netAmount * vatPercent) / 100
          : 0,
      );

      const grossAmount = this.roundMoney(
        finance.netAmount + vatAmount,
      );

      return {
        ...booking,
        finance: {
          ...finance,
          vatAmount,
          grossAmount,
        },
      };
    });

    const netTotal = this.roundMoney(
      rows.reduce((sum, row) => sum + row.finance.netAmount, 0),
    );

    const vatTotal = this.roundMoney(
      rows.reduce((sum, row) => sum + row.finance.vatAmount, 0),
    );

    const grossTotal = this.roundMoney(netTotal + vatTotal);

    return {
      driver,
      month,
      periodStart: start,
      periodEnd,
      statementDate: periodEnd,
      dueDate: periodEnd,
      bookingCount: rows.length,
      bookings: rows,
      totals: {
        netTotal,
        vatTotal,
        grossTotal,
      },
    };
  }

  async createStatement(
    driverId: string,
    month: string,
    notes?: string,
  ) {
    const preview = await this.preview(driverId, month);

    if (preview.bookingCount === 0) {
      throw new BadRequestException(
        'No eligible completed jobs were found for this driver and month',
      );
    }

    const statementNumber = await this.generateStatementNumber(month);

    try {
      const statement = await this.prisma.$transaction(async (tx) => {
        return tx.driverStatement.create({
          data: {
            statementNumber,
            driverId,
            periodStart: preview.periodStart,
            periodEnd: preview.periodEnd,
            statementDate: preview.statementDate,
            dueDate: preview.dueDate,
            currency: 'GBP',
            vatRegistered: preview.driver.vatRegistered,
            vatPercent: preview.driver.vatRegistered
              ? preview.driver.vatPercent ?? 20
              : 0,
            netTotal: preview.totals.netTotal,
            vatTotal: preview.totals.vatTotal,
            grossTotal: preview.totals.grossTotal,
            status: DriverStatementStatus.ISSUED,
            notes: notes?.trim() || null,
            items: {
              create: preview.bookings.map((booking) => ({
                bookingId: booking.id,
                bookingReference: booking.bookingReference,
                pickupDatetime: booking.pickupDatetime,
                pickupAddress: booking.pickupAddress,
                dropoffAddress: booking.dropoffAddress,
                customerName: booking.customerName,
                journeyType: booking.journeyType,
                driverCost: booking.finance.driverCost,
                driverWaitingPay: booking.finance.driverWaitingPay,
                driverParking: booking.finance.driverParking,
                driverCongestion: booking.finance.driverCongestion,
                netAmount: booking.finance.netAmount,
                vatAmount: booking.finance.vatAmount,
                grossAmount: booking.finance.grossAmount,
              })),
            },
          },
          include: {
            driver: {
              select: {
                id: true,
                name: true,
                callSign: true,
              },
            },
            items: {
              orderBy: {
                pickupDatetime: 'asc',
              },
            },
          },
        });
      });

      return {
        message: 'Driver statement generated successfully',
        statement,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'One or more jobs have already been added to another driver statement. Refresh and try again.',
        );
      }

      throw error;
    }
  }

  async list(
    driverId: string,
    month?: string,
    search?: string,
  ) {
    await this.getDriver(driverId);

    const where: Prisma.DriverStatementWhereInput = {
      driverId,
    };

    if (month) {
      const { start, endExclusive } = this.getLondonMonthBounds(month);

      where.statementDate = {
        gte: start,
        lt: endExclusive,
      };
    }

    const cleanSearch = search?.trim();

    if (cleanSearch) {
      where.statementNumber = {
        contains: cleanSearch,
        mode: 'insensitive',
      };
    }

    return this.prisma.driverStatement.findMany({
      where,
      include: {
        _count: {
          select: {
            items: true,
          },
        },
      },
      orderBy: [
        { statementDate: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async findOne(driverId: string, statementId: string) {
    const statement = await this.prisma.driverStatement.findFirst({
      where: {
        id: statementId,
        driverId,
      },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            callSign: true,
            phone: true,
            email: true,
            bankName: true,
            accountHolderName: true,
            accountNumber: true,
            sortCode: true,
          },
        },
        items: {
          orderBy: {
            pickupDatetime: 'asc',
          },
          include: {
            booking: {
              select: {
                id: true,
                status: true,
                pickupDatetime: true,
                arrivedAt: true,
                startedAt: true,
                completedAt: true,
                cancelledAt: true,
                finance: {
                  select: {
                    paymentType: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!statement) {
      throw new NotFoundException('Driver statement not found');
    }

    return statement;
  }

  async markPaid(
    driverId: string,
    statementId: string,
    paidAt?: string,
  ) {
    const statement = await this.prisma.driverStatement.findFirst({
      where: {
        id: statementId,
        driverId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!statement) {
      throw new NotFoundException('Driver statement not found');
    }

    if (statement.status === DriverStatementStatus.VOID) {
      throw new BadRequestException(
        'A void statement cannot be marked paid',
      );
    }

    if (statement.status === DriverStatementStatus.PAID) {
      throw new BadRequestException(
        'Driver statement is already paid',
      );
    }

    let paidDate = new Date();

    if (paidAt) {
      paidDate = new Date(paidAt);

      if (Number.isNaN(paidDate.getTime())) {
        throw new BadRequestException('Invalid paid date');
      }
    }

    return this.prisma.driverStatement.update({
      where: {
        id: statementId,
      },
      data: {
        status: DriverStatementStatus.PAID,
        paidAt: paidDate,
      },
    });
  }

  async markUnpaid(driverId: string, statementId: string) {
    const statement = await this.prisma.driverStatement.findFirst({
      where: {
        id: statementId,
        driverId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!statement) {
      throw new NotFoundException('Driver statement not found');
    }

    if (statement.status === DriverStatementStatus.VOID) {
      throw new BadRequestException(
        'A void statement cannot be reopened',
      );
    }

    return this.prisma.driverStatement.update({
      where: {
        id: statementId,
      },
      data: {
        status: DriverStatementStatus.ISSUED,
        paidAt: null,
      },
    });
  }
}
