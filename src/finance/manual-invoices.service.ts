import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  InvoiceGrouping,
  InvoiceStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import {
  CreateManualInvoiceDto,
  CreateManualInvoiceLineDto,
} from './dto/create-manual-invoice.dto';

const LONDON_TIME_ZONE = 'Europe/London';

@Injectable()
export class ManualInvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);

    result.setUTCDate(
      result.getUTCDate() + days,
    );

    return result;
  }

  private londonLocalToUtc(
    year: number,
    month: number,
    day: number,
    hour = 12,
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

    const formatter = new Intl.DateTimeFormat(
      'en-GB',
      {
        timeZone: LONDON_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      },
    );

    for (let i = 0; i < 3; i += 1) {
      const parts =
        formatter.formatToParts(
          new Date(guess),
        );

      const map = Object.fromEntries(
        parts
          .filter(
            (part) =>
              part.type !== 'literal',
          )
          .map((part) => [
            part.type,
            part.value,
          ]),
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

      const offset =
        representedAsUtc - guess;

      guess =
        desiredUtcLike - offset;
    }

    return new Date(guess);
  }

  private parseInvoiceDate(
    value: string,
  ) {
    const match =
      /^(\d{4})-(\d{2})-(\d{2})$/.exec(
        value,
      );

    if (!match) {
      throw new BadRequestException(
        'Invoice date must be in YYYY-MM-DD format',
      );
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const test = new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

    if (
      test.getUTCFullYear() !== year ||
      test.getUTCMonth() !==
        month - 1 ||
      test.getUTCDate() !== day
    ) {
      throw new BadRequestException(
        'Invalid invoice date',
      );
    }

    return {
      year,
      month,
      day,

      date: this.londonLocalToUtc(
        year,
        month,
        day,
      ),
    };
  }

  private generateInvoiceNumber(
    year: number,
    month: number,
  ) {
    const monthPart = `${year}${String(
      month,
    ).padStart(2, '0')}`;

    const uniquePart =
      `${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 6)}`
        .toUpperCase();

    return `5AB-MAN-${monthPart}-${uniquePart}`;
  }

  private calculateLine(
    line: CreateManualInvoiceLineDto,
  ) {
    const quantity =
      Number(line.quantity);

    const unitPrice =
      this.roundMoney(
        Number(line.unitPrice),
      );

    const vatPercent =
      Number(line.vatPercent);

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      throw new BadRequestException(
        'Manual invoice quantity must be greater than 0',
      );
    }

    if (
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      throw new BadRequestException(
        'Manual invoice unit price cannot be negative',
      );
    }

    if (
      !Number.isFinite(vatPercent) ||
      vatPercent < 0 ||
      vatPercent > 100
    ) {
      throw new BadRequestException(
        'VAT percent must be between 0 and 100',
      );
    }

    const netAmount =
      this.roundMoney(
        quantity * unitPrice,
      );

    const vatAmount =
      this.roundMoney(
        netAmount *
          (vatPercent / 100),
      );

    const totalAmount =
      this.roundMoney(
        netAmount + vatAmount,
      );

    return {
      description:
        line.description.trim(),

      quantity,
      unitPrice,
      vatPercent,
      netAmount,
      vatAmount,
      totalAmount,
    };
  }

  async create(
    dto: CreateManualInvoiceDto,
  ) {
    const account =
      await this.prisma.clientAccount.findUnique(
        {
          where: {
            id: dto.accountId,
          },

          select: {
            id: true,
            name: true,
            email: true,
            billingAddress: true,
            invoiceEmail: true,
            invoiceDueDays: true,
            isActive: true,
          },
        },
      );

    if (!account) {
      throw new NotFoundException(
        'Client account not found',
      );
    }

    if (!account.isActive) {
      throw new BadRequestException(
        'Client account is inactive',
      );
    }

    let booker: {
      id: string;
      name: string;
      email: string | null;
      accountId: string | null;
    } | null = null;

    if (dto.bookerId) {
      booker =
        await this.prisma.booker.findUnique(
          {
            where: {
              id: dto.bookerId,
            },

            select: {
              id: true,
              name: true,
              email: true,
              accountId: true,
            },
          },
        );

      if (!booker) {
        throw new NotFoundException(
          'Booker not found',
        );
      }

      if (
        booker.accountId !==
        account.id
      ) {
        throw new BadRequestException(
          'Selected booker does not belong to this client account',
        );
      }
    }

    const parsedDate =
      this.parseInvoiceDate(
        dto.invoiceDate,
      );

    const lines = dto.lines.map(
      (line) =>
        this.calculateLine(line),
    );

    if (!lines.length) {
      throw new BadRequestException(
        'At least one manual invoice line is required',
      );
    }

    if (
      lines.some(
        (line) =>
          !line.description,
      )
    ) {
      throw new BadRequestException(
        'Every manual invoice line needs a description',
      );
    }

    const netTotal =
      this.roundMoney(
        lines.reduce(
          (sum, line) =>
            sum + line.netAmount,
          0,
        ),
      );

    const vatTotal =
      this.roundMoney(
        lines.reduce(
          (sum, line) =>
            sum + line.vatAmount,
          0,
        ),
      );

    const totalAmount =
      this.roundMoney(
        lines.reduce(
          (sum, line) =>
            sum + line.totalAmount,
          0,
        ),
      );

    if (totalAmount <= 0) {
      throw new BadRequestException(
        'Manual invoice total must be greater than 0',
      );
    }

    const billingName =
      dto.billingName?.trim() ||
      (booker
        ? `${account.name} — ${booker.name}`
        : account.name);

    const billingEmail =
      dto.billingEmail?.trim() ||
      booker?.email ||
      account.invoiceEmail ||
      account.email ||
      null;

    const billingAddress =
      dto.billingAddress?.trim() ||
      account.billingAddress ||
      null;

    const issueNow =
      Boolean(dto.issueNow);

    const issuedAt =
      issueNow ? new Date() : null;

    const dueDate =
      issueNow && issuedAt
        ? this.addDays(
            issuedAt,
            Math.max(
              account.invoiceDueDays,
              0,
            ),
          )
        : null;

    const invoiceNumber =
      this.generateInvoiceNumber(
        parsedDate.year,
        parsedDate.month,
      );

    const invoice =
      await this.prisma.invoice.create(
        {
          data: {
            invoiceNumber,

            accountId: account.id,
            bookerId:
              booker?.id ?? null,

            grouping: booker
              ? InvoiceGrouping.BOOKER
              : InvoiceGrouping.ACCOUNT,

            periodStart:
              parsedDate.date,

            periodEnd:
              parsedDate.date,

            billingName,
            billingEmail,
            billingAddress,

            currency: 'GBP',

            netTotal,
            vatTotal,

            subtotal: netTotal,

            adjustmentTotal: 0,

            totalAmount,

            amountPaid: 0,

            status: issueNow
              ? InvoiceStatus.ISSUED
              : InvoiceStatus.DRAFT,

            issuedAt,
            dueDate,

            notes:
              dto.notes?.trim() ||
              null,

            items: {
              create: lines.map(
                (
                  line,
                  index,
                ) => ({
                  bookingId: null,

                  bookingReference:
                    `MANUAL-${String(
                      index + 1,
                    ).padStart(
                      2,
                      '0',
                    )}`,

                  pickupDatetime:
                    parsedDate.date,

                  pickupAddress: '',
                  dropoffAddress: '',

                  journeyType:
                    'MANUAL',

                  primaryBookerName:
                    booker?.name ??
                    null,

                  passengerName:
                    null,

                  costCenter: null,
                  invoiceRef: null,

                  quotedAmount:
                    line.unitPrice,

                  waitingCharge: 0,
                  parkingCharge: 0,
                  congestionCharge: 0,
                  discountAmount: 0,

                  clientSubtotal:
                    line.netAmount,

                  adminFee: 0,

                  netAmount:
                    line.netAmount,

                  vatAmount:
                    line.vatAmount,

                  vatPercent:
                    line.vatPercent,

                  totalAmount:
                    line.totalAmount,

                  paymentType:
                    'MANUAL',

                  invoiceNote:
                    `${line.description}\nQty: ${line.quantity} | Unit: £${line.unitPrice.toFixed(2)}`,
                }),
              ),
            },
          },

          include: {
            account: true,
            booker: true,

            items: {
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      );

    return {
      message: issueNow
        ? 'Manual invoice created and issued successfully'
        : 'Manual invoice saved as draft successfully',

      invoice,
    };
  }
}
