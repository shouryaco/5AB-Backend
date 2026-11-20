import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  DriverStatementStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const LONDON_TIME_ZONE = 'Europe/London';

@Injectable()
export class DriverPaymentsService {
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
      start,
      endExclusive,
    };
  }

  private parseStatus(status?: string) {
    if (!status) {
      return undefined;
    }

    const cleanStatus = status.trim().toUpperCase();

    if (
      !Object.values(DriverStatementStatus).includes(
        cleanStatus as DriverStatementStatus,
      )
    ) {
      throw new BadRequestException('Invalid driver statement status');
    }

    return cleanStatus as DriverStatementStatus;
  }

  async list(params: {
    month?: string;
    search?: string;
    status?: string;
    driverId?: string;
    page?: string;
    limit?: string;
  }) {
    const page = Math.max(Number(params.page || 1) || 1, 1);
    const limit = Math.min(
      Math.max(Number(params.limit || 100) || 100, 1),
      250,
    );

    const where: Prisma.DriverStatementWhereInput = {};

    if (params.month) {
      const { start, endExclusive } =
        this.getLondonMonthBounds(params.month);

      where.statementDate = {
        gte: start,
        lt: endExclusive,
      };
    }

    const status = this.parseStatus(params.status);

    if (status) {
      where.status = status;
    }

    if (params.driverId?.trim()) {
      where.driverId = params.driverId.trim();
    }

    const search = params.search?.trim();

    if (search) {
      where.OR = [
        {
          statementNumber: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          driver: {
            is: {
              name: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
        },
        {
          driver: {
            is: {
              callSign: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
        },
      ];
    }

    const [statements, total] = await this.prisma.$transaction([
      this.prisma.driverStatement.findMany({
        where,

        include: {
          driver: {
            select: {
              id: true,
              name: true,
              callSign: true,
              phone: true,
              email: true,
            },
          },

          _count: {
            select: {
              items: true,
            },
          },
        },

        orderBy: [
          {
            periodStart: 'desc',
          },
          {
            driver: {
              name: 'asc',
            },
          },
          {
            createdAt: 'desc',
          },
        ],

        skip: (page - 1) * limit,
        take: limit,
      }),

      this.prisma.driverStatement.count({
        where,
      }),
    ]);

    const rows = statements.map((statement) => {
      const fullyPaid =
        statement.status === DriverStatementStatus.PAID;

      const balance =
        statement.status === DriverStatementStatus.VOID || fullyPaid
          ? 0
          : this.roundMoney(statement.grossTotal);

      return {
        ...statement,
        totalEarning: this.roundMoney(statement.grossTotal),
        priorityPay: null,
        balance,
        fullyPaid,
      };
    });

    const activeRows = rows.filter(
      (statement) =>
        statement.status !== DriverStatementStatus.VOID,
    );

    const totalEarning = this.roundMoney(
      activeRows.reduce(
        (sum, statement) => sum + statement.totalEarning,
        0,
      ),
    );

    const totalPaid = this.roundMoney(
      activeRows.reduce(
        (sum, statement) =>
          sum + (statement.fullyPaid ? statement.totalEarning : 0),
        0,
      ),
    );

    const outstanding = this.roundMoney(
      activeRows.reduce(
        (sum, statement) => sum + statement.balance,
        0,
      ),
    );

    return {
      data: rows,

      summary: {
        statementCount: activeRows.length,
        totalEarning,
        totalPaid,
        outstanding,
        paidCount: activeRows.filter(
          (statement) => statement.fullyPaid,
        ).length,
        unpaidCount: activeRows.filter(
          (statement) => !statement.fullyPaid,
        ).length,
      },

      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(statementId: string) {
    const statement =
      await this.prisma.driverStatement.findUnique({
        where: {
          id: statementId,
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

  async markPaid(statementId: string, paidAt?: string) {
    const statement =
      await this.prisma.driverStatement.findUnique({
        where: {
          id: statementId,
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

  async markUnpaid(statementId: string) {
    const statement =
      await this.prisma.driverStatement.findUnique({
        where: {
          id: statementId,
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
