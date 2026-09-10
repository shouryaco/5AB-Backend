import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  InvoiceGrouping,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { MarkInvoicePaidDto } from './dto/mark-invoice-paid.dto';
import { PreviewInvoiceDto } from './dto/preview-invoice.dto';
import { QueryInvoiceSummaryDto } from './dto/query-invoice-summary.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { UpdateBillingSettingsDto } from './dto/update-billing-settings.dto';

const LONDON_TIME_ZONE = 'Europe/London';

type EligibleBooking = Prisma.BookingGetPayload<{
  include: {
    finance: true;
    bookers: {
      orderBy: {
        position: 'asc';
      };
      include: {
        booker: true;
      };
    };
    passengersList: {
      orderBy: {
        position: 'asc';
      };
      include: {
        passenger: true;
      };
    };
  };
}>;

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  /* =====================================================
     DATE / MONEY HELPERS
  ===================================================== */

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  /**
   * Converts a wall-clock date/time in Europe/London to UTC without
   * requiring another date library. The iteration accounts for GMT/BST.
   */
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
      throw new BadRequestException('Invalid billing month');
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
      periodEnd: new Date(endExclusive.getTime() - 1),
    };
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private getPrimaryBooker(booking: EligibleBooking) {
    return (
      booking.bookers.find((relation) => relation.isPrimary)?.booker ??
      booking.bookers[0]?.booker ??
      null
    );
  }

  private getPrimaryPassenger(booking: EligibleBooking) {
    return (
      booking.passengersList.find((relation) => relation.isPrimary)?.passenger ??
      booking.passengersList[0]?.passenger ??
      null
    );
  }

  private getFinanceNumbers(booking: EligibleBooking) {
    const finance = booking.finance;

    if (!finance || finance.clientTotalAmount === null) {
      throw new BadRequestException(
        `Booking ${booking.bookingReference} does not have a final client total`,
      );
    }

    const vatAmount = this.roundMoney(finance.clientVat ?? 0);

    const netAmount = this.roundMoney(
      finance.clientNet ??
        Math.max((finance.clientTotalAmount ?? 0) - vatAmount, 0),
    );

    return {
      quotedAmount: finance.clientQuote,
      waitingCharge: this.roundMoney(finance.clientWaitingCharge ?? 0),
      parkingCharge: this.roundMoney(finance.clientParking ?? 0),
      congestionCharge: this.roundMoney(finance.clientCongestion ?? 0),
      discountAmount: this.roundMoney(finance.clientDiscount ?? 0),
      clientSubtotal: this.roundMoney(
        finance.clientTotal ?? finance.clientNet ?? netAmount,
      ),
      adminFee: this.roundMoney(finance.clientAdminFee ?? 0),
      netAmount,
      vatAmount,
      vatPercent: finance.clientVatPercent,
      totalAmount: this.roundMoney(finance.clientTotalAmount),
      paymentType: finance.paymentType,
      invoiceNote: finance.invoiceNote,
    };
  }

  /* =====================================================
     ACCOUNT / BOOKER VALIDATION
  ===================================================== */

  private async getBillingAccount(accountId: string) {
    const account = await this.prisma.clientAccount.findUnique({
      where: {
        id: accountId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        billingAddress: true,
        invoiceEmail: true,
        invoiceGrouping: true,
        invoiceDueDays: true,
        isActive: true,
      },
    });

    if (!account) {
      throw new NotFoundException('Client account not found');
    }

    return account;
  }

  private async getBillingBooker(accountId: string, bookerId: string) {
    const booker = await this.prisma.booker.findUnique({
      where: {
        id: bookerId,
      },
      select: {
        id: true,
        accountId: true,
        name: true,
        email: true,
      },
    });

    if (!booker) {
      throw new NotFoundException('Booker not found');
    }

    if (booker.accountId !== accountId) {
      throw new BadRequestException(
        'Selected booker does not belong to this client account',
      );
    }

    return booker;
  }

  /* =====================================================
     CLIENT BILLING SETTINGS
  ===================================================== */

  async getBillingSettings(accountId: string) {
    const account = await this.getBillingAccount(accountId);

    return {
      accountId: account.id,
      accountName: account.name,
      invoiceEmail: account.invoiceEmail ?? account.email,
      invoiceGrouping: account.invoiceGrouping,
      invoiceDueDays: account.invoiceDueDays,
      billingAddress: account.billingAddress,
    };
  }

  async updateBillingSettings(
    accountId: string,
    dto: UpdateBillingSettingsDto,
  ) {
    await this.getBillingAccount(accountId);

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('No billing settings were supplied');
    }

    const updated = await this.prisma.clientAccount.update({
      where: {
        id: accountId,
      },
      data: {
        ...(dto.invoiceEmail !== undefined
          ? {
              invoiceEmail: dto.invoiceEmail?.trim() || null,
            }
          : {}),

        ...(dto.invoiceGrouping !== undefined
          ? {
              invoiceGrouping: dto.invoiceGrouping,
            }
          : {}),

        ...(dto.invoiceDueDays !== undefined
          ? {
              invoiceDueDays: dto.invoiceDueDays,
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        billingAddress: true,
        invoiceEmail: true,
        invoiceGrouping: true,
        invoiceDueDays: true,
      },
    });

    return {
      message: 'Client billing settings updated successfully',
      settings: {
        accountId: updated.id,
        accountName: updated.name,
        invoiceEmail: updated.invoiceEmail ?? updated.email,
        invoiceGrouping: updated.invoiceGrouping,
        invoiceDueDays: updated.invoiceDueDays,
        billingAddress: updated.billingAddress,
      },
    };
  }

  /* =====================================================
     ELIGIBLE MONTHLY BOOKINGS
  ===================================================== */

  private async getEligibleBookings(
    month: string,
    accountId: string,
    bookerId?: string,
  ) {
    const { start, endExclusive } = this.getLondonMonthBounds(month);

    return this.prisma.booking.findMany({
      where: {
        accountId,
        status: BookingStatus.COMPLETED,
        pickupDatetime: {
          gte: start,
          lt: endExclusive,
        },

        // A booking attached to a non-void invoice has a current InvoiceItem.
        // VOID releases bookingId from the historical invoice item.
        invoiceItem: {
          is: null,
        },

        finance: {
          is: {
            paymentType: {
              equals: 'ACCOUNT',
              mode: 'insensitive',
            },
            clientTotalAmount: {
              not: null,
            },
          },
        },

        ...(bookerId
          ? {
              bookers: {
                some: {
                  bookerId,
                  isPrimary: true,
                },
              },
            }
          : {}),
      },

      include: {
        finance: true,

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
      },

      orderBy: {
        pickupDatetime: 'asc',
      },
    });
  }

  private buildPreviewRows(bookings: EligibleBooking[]) {
    return bookings.map((booking) => {
      const finance = this.getFinanceNumbers(booking);
      const primaryBooker = this.getPrimaryBooker(booking);
      const primaryPassenger = this.getPrimaryPassenger(booking);

      return {
        bookingId: booking.id,
        bookingReference: booking.bookingReference,
        pickupDatetime: booking.pickupDatetime,
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
        journeyType: booking.journeyType,
        costCenter: booking.costCenter,
        invoiceRef: booking.invoiceRef,

        primaryBooker: primaryBooker
          ? {
              id: primaryBooker.id,
              name: primaryBooker.name,
              email: primaryBooker.email,
            }
          : null,

        primaryPassenger: primaryPassenger
          ? {
              id: primaryPassenger.id,
              name: primaryPassenger.name,
            }
          : null,

        finance,
      };
    });
  }

  private buildTotals(bookings: EligibleBooking[], adjustmentTotal = 0) {
    let subtotal = 0;
    let netTotal = 0;
    let vatTotal = 0;
    let bookingTotal = 0;

    for (const booking of bookings) {
      const finance = this.getFinanceNumbers(booking);

      subtotal += finance.clientSubtotal;
      netTotal += finance.netAmount;
      vatTotal += finance.vatAmount;
      bookingTotal += finance.totalAmount;
    }

    const adjustment = this.roundMoney(adjustmentTotal);

    return {
      subtotal: this.roundMoney(subtotal),
      netTotal: this.roundMoney(netTotal),
      vatTotal: this.roundMoney(vatTotal),
      bookingTotal: this.roundMoney(bookingTotal),
      adjustmentTotal: adjustment,
      totalAmount: this.roundMoney(bookingTotal + adjustment),
    };
  }

  /* =====================================================
     PREVIEW
  ===================================================== */

  async previewInvoice(dto: PreviewInvoiceDto) {
    const account = await this.getBillingAccount(dto.accountId);

    const booker = dto.bookerId
      ? await this.getBillingBooker(dto.accountId, dto.bookerId)
      : null;

    const bookings = await this.getEligibleBookings(
      dto.month,
      dto.accountId,
      dto.bookerId,
    );

    const { start, periodEnd } = this.getLondonMonthBounds(dto.month);

    return {
      month: dto.month,
      periodStart: start,
      periodEnd,

      account: {
        id: account.id,
        name: account.name,
        invoiceEmail: account.invoiceEmail ?? account.email,
        billingAddress: account.billingAddress,
        invoiceGrouping: account.invoiceGrouping,
        invoiceDueDays: account.invoiceDueDays,
      },

      booker,

      eligibility: {
        status: BookingStatus.COMPLETED,
        paymentType: 'ACCOUNT',
        uninvoicedOnly: true,
        usesPrimaryBookerForBookerInvoices: true,
      },

      bookingCount: bookings.length,
      bookings: this.buildPreviewRows(bookings),
      totals: this.buildTotals(bookings),
    };
  }

  /* =====================================================
     CREATE DRAFT INVOICE
  ===================================================== */

  private generateInvoiceNumber(month: string) {
    const monthPart = month.replace('-', '');
    const uniquePart = `${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 6)}`.toUpperCase();

    return `5AB-INV-${monthPart}-${uniquePart}`;
  }

  async createInvoice(dto: CreateInvoiceDto) {
    const account = await this.getBillingAccount(dto.accountId);

    const grouping =
      dto.grouping ??
      (dto.bookerId ? InvoiceGrouping.BOOKER : account.invoiceGrouping);

    if (grouping === InvoiceGrouping.BOOKER && !dto.bookerId) {
      throw new BadRequestException(
        'bookerId is required when invoice grouping is BOOKER',
      );
    }

    if (grouping === InvoiceGrouping.ACCOUNT && dto.bookerId) {
      throw new BadRequestException(
        'bookerId must not be supplied when invoice grouping is ACCOUNT',
      );
    }

    const booker =
      grouping === InvoiceGrouping.BOOKER && dto.bookerId
        ? await this.getBillingBooker(dto.accountId, dto.bookerId)
        : null;

    const bookings = await this.getEligibleBookings(
      dto.month,
      dto.accountId,
      booker?.id,
    );

    if (bookings.length === 0) {
      throw new BadRequestException(
        'No eligible completed account bookings were found for this invoice',
      );
    }

    const adjustmentTotal = dto.adjustmentTotal ?? 0;
    const totals = this.buildTotals(bookings, adjustmentTotal);
    const { start, periodEnd } = this.getLondonMonthBounds(dto.month);

    const billingName = booker
      ? `${account.name} — ${booker.name}`
      : account.name;

    const billingEmail = booker?.email ?? account.invoiceEmail ?? account.email;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: this.generateInvoiceNumber(dto.month),

            accountId: account.id,
            bookerId: booker?.id,
            grouping,

            periodStart: start,
            periodEnd,

            billingName,
            billingEmail,
            billingAddress: account.billingAddress,

            currency: 'GBP',

            netTotal: totals.netTotal,
            vatTotal: totals.vatTotal,
            subtotal: totals.subtotal,
            adjustmentTotal: totals.adjustmentTotal,
            totalAmount: totals.totalAmount,

            status: InvoiceStatus.DRAFT,
            notes: dto.notes?.trim() || null,

            items: {
              create: bookings.map((booking) => {
                const finance = this.getFinanceNumbers(booking);
                const primaryBooker = this.getPrimaryBooker(booking);
                const primaryPassenger = this.getPrimaryPassenger(booking);

                return {
                  bookingId: booking.id,

                  bookingReference: booking.bookingReference,
                  pickupDatetime: booking.pickupDatetime,
                  pickupAddress: booking.pickupAddress,
                  dropoffAddress: booking.dropoffAddress,

                  journeyType: booking.journeyType,
                  primaryBookerName: primaryBooker?.name ?? null,
                  passengerName: primaryPassenger?.name ?? booking.customerName,
                  costCenter: booking.costCenter,
                  invoiceRef: booking.invoiceRef,

                  quotedAmount: finance.quotedAmount,
                  waitingCharge: finance.waitingCharge,
                  parkingCharge: finance.parkingCharge,
                  congestionCharge: finance.congestionCharge,
                  discountAmount: finance.discountAmount,
                  clientSubtotal: finance.clientSubtotal,
                  adminFee: finance.adminFee,
                  netAmount: finance.netAmount,
                  vatAmount: finance.vatAmount,
                  vatPercent: finance.vatPercent,
                  totalAmount: finance.totalAmount,

                  paymentType: finance.paymentType,
                  invoiceNote: finance.invoiceNote,
                };
              }),
            },
          },

          include: {
            account: true,
            booker: true,
            items: {
              orderBy: {
                pickupDatetime: 'asc',
              },
            },
          },
        });

        return {
          message: 'Draft invoice generated successfully',
          invoice,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'One or more selected bookings have already been invoiced. Refresh the preview and try again.',
        );
      }

      throw error;
    }
  }

  /* =====================================================
     INVOICE LIST + DETAIL
  ===================================================== */

  private displayStatus(invoice: {
    status: InvoiceStatus;
    dueDate: Date | null;
    totalAmount: number;
    amountPaid: number;
  }) {
    const overdueEligibleStatuses: InvoiceStatus[] = [
      InvoiceStatus.ISSUED,
      InvoiceStatus.PARTIALLY_PAID,
    ];

    if (
      overdueEligibleStatuses.includes(invoice.status) &&
      invoice.dueDate &&
      invoice.dueDate.getTime() < Date.now() &&
      invoice.amountPaid < invoice.totalAmount
    ) {
      return InvoiceStatus.OVERDUE;
    }

    return invoice.status;
  }

  async findInvoices(query: QueryInvoicesDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;

    const where: Prisma.InvoiceWhereInput = {
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.bookerId ? { bookerId: query.bookerId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    if (query.month) {
      const { start, endExclusive } = this.getLondonMonthBounds(query.month);

      where.periodStart = {
        gte: start,
        lt: endExclusive,
      };
    }

    const [invoices, total] = await this.prisma.$transaction([
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
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),

      this.prisma.invoice.count({
        where,
      }),
    ]);

    return {
      data: invoices.map((invoice) => ({
        ...invoice,
        displayStatus: this.displayStatus(invoice),
        outstandingAmount: this.roundMoney(
          Math.max(invoice.totalAmount - invoice.amountPaid, 0),
        ),
      })),

      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: {
        id,
      },
      include: {
        account: true,
        booker: true,
        items: {
          orderBy: {
            pickupDatetime: 'asc',
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return {
      ...invoice,
      displayStatus: this.displayStatus(invoice),
      outstandingAmount: this.roundMoney(
        Math.max(invoice.totalAmount - invoice.amountPaid, 0),
      ),
    };
  }

  /* =====================================================
     INVOICE SUMMARY
  ===================================================== */

  async getInvoiceSummary(query: QueryInvoiceSummaryDto) {
    const where: Prisma.InvoiceWhereInput = {
      ...(query.accountId ? { accountId: query.accountId } : {}),
    };

    if (query.month) {
      const { start, endExclusive } = this.getLondonMonthBounds(query.month);

      where.periodStart = {
        gte: start,
        lt: endExclusive,
      };
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      select: {
        id: true,
        status: true,
        totalAmount: true,
        amountPaid: true,
        dueDate: true,
      },
    });

    let totalInvoiced = 0;
    let paid = 0;
    let outstanding = 0;
    let overdue = 0;
    let draftTotal = 0;

    const counts: Record<string, number> = {};

    for (const invoice of invoices) {
      const displayStatus = this.displayStatus(invoice);

      counts[displayStatus] = (counts[displayStatus] ?? 0) + 1;

      if (invoice.status === InvoiceStatus.DRAFT) {
        draftTotal += invoice.totalAmount;
        continue;
      }

      if (invoice.status === InvoiceStatus.VOID) {
        continue;
      }

      totalInvoiced += invoice.totalAmount;
      paid += invoice.amountPaid;

      const balance = Math.max(
        invoice.totalAmount - invoice.amountPaid,
        0,
      );

      outstanding += balance;

      if (displayStatus === InvoiceStatus.OVERDUE) {
        overdue += balance;
      }
    }

    return {
      month: query.month ?? null,
      accountId: query.accountId ?? null,

      invoiceCount: invoices.length,

      totals: {
        totalInvoiced: this.roundMoney(totalInvoiced),
        paid: this.roundMoney(paid),
        outstanding: this.roundMoney(outstanding),
        overdue: this.roundMoney(overdue),
        draft: this.roundMoney(draftTotal),
      },

      counts,
    };
  }

  /* =====================================================
     ISSUE
  ===================================================== */

  async issueInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        status: true,
        account: {
          select: {
            invoiceDueDays: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only draft invoices can be issued');
    }

    const issuedAt = new Date();
    const dueDate = this.addDays(
      issuedAt,
      Math.max(invoice.account.invoiceDueDays, 0),
    );

    const updated = await this.prisma.invoice.update({
      where: {
        id,
      },
      data: {
        status: InvoiceStatus.ISSUED,
        issuedAt,
        dueDate,
      },
    });

    return {
      message: 'Invoice issued successfully',
      invoice: updated,
    };
  }

  /* =====================================================
     PAYMENT
  ===================================================== */

  async markInvoicePaid(id: string, dto: MarkInvoicePaidDto) {
    const invoice = await this.prisma.invoice.findUnique({
      where: {
        id,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const payableStatuses: InvoiceStatus[] = [
      InvoiceStatus.ISSUED,
      InvoiceStatus.PARTIALLY_PAID,
      InvoiceStatus.OVERDUE,
    ];

    if (!payableStatuses.includes(invoice.status)) {
      throw new BadRequestException(
        'Only issued or partially paid invoices can receive payments',
      );
    }

    const outstanding = this.roundMoney(
      Math.max(invoice.totalAmount - invoice.amountPaid, 0),
    );

    if (outstanding <= 0) {
      throw new BadRequestException('Invoice is already fully paid');
    }

    const paymentAmount =
      dto.amount === undefined ? outstanding : this.roundMoney(dto.amount);

    if (paymentAmount > outstanding) {
      throw new BadRequestException(
        `Payment exceeds outstanding balance of £${outstanding.toFixed(2)}`,
      );
    }

    const amountPaid = this.roundMoney(invoice.amountPaid + paymentAmount);
    const isFullyPaid = amountPaid >= invoice.totalAmount;

    const updated = await this.prisma.invoice.update({
      where: {
        id,
      },
      data: {
        amountPaid,
        status: isFullyPaid
          ? InvoiceStatus.PAID
          : InvoiceStatus.PARTIALLY_PAID,
        paidAt: isFullyPaid ? new Date() : null,
      },
    });

    return {
      message: isFullyPaid
        ? 'Invoice marked as paid'
        : 'Partial payment recorded',
      invoice: {
        ...updated,
        outstandingAmount: this.roundMoney(
          Math.max(updated.totalAmount - updated.amountPaid, 0),
        ),
      },
    };
  }

  /* =====================================================
     VOID

     Historical invoice lines remain, but bookingId is released so the
     original jobs can be included in a corrected replacement invoice.
  ===================================================== */

  async voidInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.VOID) {
      throw new BadRequestException('Invoice is already void');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException(
        'A paid invoice cannot be voided directly. Handle the payment/refund first.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Keep the line-item snapshots, but detach the live bookings.
      await tx.invoiceItem.updateMany({
        where: {
          invoiceId: id,
        },
        data: {
          bookingId: null,
        },
      });

      return tx.invoice.update({
        where: {
          id,
        },
        data: {
          status: InvoiceStatus.VOID,
        },
      });
    });

    return {
      message:
        'Invoice voided. Its historical snapshot was retained and the bookings were released for re-invoicing.',
      invoice: updated,
    };
  }
}
