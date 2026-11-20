import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import {
  InvoiceStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const LONDON_TIME_ZONE = 'Europe/London';

@Injectable()
export class ArchivedInvoicesService {
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
      throw new BadRequestException(
        'Month must be in YYYY-MM format',
      );
    }

    const nextMonthNumber =
      monthNumber === 12 ? 1 : monthNumber + 1;

    const nextMonthYear =
      monthNumber === 12 ? year + 1 : year;

    return {
      start: this.londonLocalToUtc(
        year,
        monthNumber,
        1,
      ),

      endExclusive: this.londonLocalToUtc(
        nextMonthYear,
        nextMonthNumber,
        1,
      ),
    };
  }

  async list(params: {
    month?: string;
    accountId?: string;
    search?: string;
    page?: string;
    limit?: string;
  }) {
    const page = Math.max(
      Number(params.page || 1) || 1,
      1,
    );

    const limit = Math.min(
      Math.max(
        Number(params.limit || 50) || 50,
        1,
      ),
      250,
    );

    const where: Prisma.InvoiceWhereInput = {
      status: InvoiceStatus.VOID,
    };

    if (params.month) {
      const { start, endExclusive } =
        this.getLondonMonthBounds(
          params.month,
        );

      where.periodStart = {
        gte: start,
        lt: endExclusive,
      };
    }

    if (params.accountId?.trim()) {
      where.accountId =
        params.accountId.trim();
    }

    const search = params.search?.trim();

    if (search) {
      where.OR = [
        {
          invoiceNumber: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          billingName: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          billingEmail: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          account: {
            is: {
              name: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
        },
        {
          booker: {
            is: {
              name: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
        },
      ];
    }

    const [invoices, total] =
      await this.prisma.$transaction([
        this.prisma.invoice.findMany({
          where,

          include: {
            account: {
              select: {
                id: true,
                name: true,
              },
            },

            booker: {
              select: {
                id: true,
                name: true,
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
              updatedAt: 'desc',
            },
            {
              createdAt: 'desc',
            },
          ],

          skip: (page - 1) * limit,
          take: limit,
        }),

        this.prisma.invoice.count({
          where,
        }),
      ]);

    const summaryRows =
      await this.prisma.invoice.findMany({
        where,

        select: {
          netTotal: true,
          vatTotal: true,
          totalAmount: true,
          amountPaid: true,
        },
      });

    const summary = summaryRows.reduce(
      (totals, invoice) => {
        totals.net += invoice.netTotal;
        totals.vat += invoice.vatTotal;
        totals.gross +=
          invoice.totalAmount;

        totals.amountPaid +=
          invoice.amountPaid;

        return totals;
      },
      {
        net: 0,
        vat: 0,
        gross: 0,
        amountPaid: 0,
      },
    );

    return {
      data: invoices.map((invoice) => ({
        ...invoice,

        archivedAt: invoice.updatedAt,

        outstandingAtArchive:
          this.roundMoney(
            Math.max(
              invoice.totalAmount -
                invoice.amountPaid,
              0,
            ),
          ),
      })),

      summary: {
        invoiceCount: total,
        net: this.roundMoney(summary.net),
        vat: this.roundMoney(summary.vat),
        gross: this.roundMoney(
          summary.gross,
        ),
        amountPaid: this.roundMoney(
          summary.amountPaid,
        ),
      },

      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(
          1,
          Math.ceil(total / limit),
        ),
      },
    };
  }
}
