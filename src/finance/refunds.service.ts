import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  PaymentLinkStatus,
  Prisma,
  RefundStatus,
} from '@prisma/client';

import Stripe from 'stripe';

import { PrismaService } from '../prisma/prisma.service';

import { CreateRefundRequestDto } from './dto/create-refund-request.dto';
import { RejectRefundRequestDto } from './dto/reject-refund-request.dto';

@Injectable()
export class RefundsService {
  constructor(private readonly prisma: PrismaService) { }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private moneyToMinor(value: number) {
    return Math.round(this.roundMoney(value) * 100);
  }

  private getStripe() {
    const key = process.env.STRIPE_SECRET_KEY?.trim();

    if (!key) {
      throw new ServiceUnavailableException(
        'Stripe is not configured. STRIPE_SECRET_KEY is missing.',
      );
    }

    return new Stripe(key);
  }

  private generateRefundNumber() {
    const date = new Date();

    const stamp = [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('');

    const unique = `${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 5)}`
      .toUpperCase();

    return `REF-${stamp}-${unique}`;
  }

  private mapStripeRefundStatus(
    refund: Stripe.Refund,
  ): RefundStatus {
    switch (refund.status) {
      case 'succeeded':
        return RefundStatus.REFUNDED;

      case 'pending':
      case 'requires_action':
        return RefundStatus.PROCESSING;

      case 'failed':
      case 'canceled':
        return RefundStatus.FAILED;

      default:
        return RefundStatus.PROCESSING;
    }
  }

  private async getReservedRefundAmount(
    paymentLinkId: string,
    excludeRefundId?: string,
  ) {
    const rows =
      await this.prisma.refundRequest.findMany({
        where: {
          paymentLinkId,

          ...(excludeRefundId
            ? {
              id: {
                not: excludeRefundId,
              },
            }
            : {}),

          status: {
            in: [
              RefundStatus.REQUESTED,
              RefundStatus.PROCESSING,
              RefundStatus.REFUNDED,
            ],
          },
        },

        select: {
          refundAmount: true,
        },
      });

    return this.roundMoney(
      rows.reduce(
        (sum, row) =>
          sum + row.refundAmount,
        0,
      ),
    );
  }

  private async buildPaymentSearchRow(
    paymentLink: {
      id: string;
      accountId: string | null;
      bookingId: string | null;
      bookingReference: string | null;
      accountName: string | null;
      customerName: string;
      customerEmail: string;
      totalAmount: number;
      paidAt: Date | null;
      stripePaymentIntentId: string | null;
      account: {
        id: string;
        name: string;
      } | null;
    },
  ) {
    const reserved =
      await this.getReservedRefundAmount(
        paymentLink.id,
      );

    const remaining =
      this.roundMoney(
        Math.max(
          paymentLink.totalAmount -
          reserved,
          0,
        ),
      );

    return {
      ...paymentLink,

      refundedOrReserved:
        reserved,

      refundableRemaining:
        remaining,
    };
  }

  async searchPayments(search?: string) {
    const clean = search?.trim();

    if (!clean || clean.length < 2) {
      return [];
    }

    const rows =
      await this.prisma.paymentLink.findMany({
        where: {
          status: PaymentLinkStatus.PAID,

          stripePaymentIntentId: {
            not: null,
          },

          OR: [
            {
              bookingReference: {
                contains: clean,
                mode: 'insensitive',
              },
            },
            {
              customerName: {
                contains: clean,
                mode: 'insensitive',
              },
            },
            {
              customerEmail: {
                contains: clean,
                mode: 'insensitive',
              },
            },
            {
              accountName: {
                contains: clean,
                mode: 'insensitive',
              },
            },
          ],
        },

        select: {
          id: true,
          accountId: true,
          bookingId: true,
          bookingReference: true,
          accountName: true,
          customerName: true,
          customerEmail: true,
          totalAmount: true,
          paidAt: true,
          stripePaymentIntentId: true,

          account: {
            select: {
              id: true,
              name: true,
            },
          },
        },

        orderBy: {
          paidAt: 'desc',
        },

        take: 20,
      });

    const result = await Promise.all(
      rows.map((row) =>
        this.buildPaymentSearchRow(row),
      ),
    );

    return result.filter(
      (row) =>
        row.refundableRemaining > 0,
    );
  }

  async list(params: {
    search?: string;
    status?: string;
    month?: string;
    accountId?: string;
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

    const where: Prisma.RefundRequestWhereInput = {};

    if (params.accountId?.trim()) {
      where.accountId =
        params.accountId.trim();
    }

    if (params.status?.trim()) {
      const status =
        params.status.trim().toUpperCase();

      if (
        !Object.values(RefundStatus).includes(
          status as RefundStatus,
        )
      ) {
        throw new BadRequestException(
          'Invalid refund status',
        );
      }

      where.status =
        status as RefundStatus;
    }

    if (params.month?.trim()) {
      const match =
        /^(\d{4})-(\d{2})$/.exec(
          params.month.trim(),
        );

      if (!match) {
        throw new BadRequestException(
          'Month must be in YYYY-MM format',
        );
      }

      const year = Number(match[1]);
      const month = Number(match[2]);

      if (month < 1 || month > 12) {
        throw new BadRequestException(
          'Invalid month',
        );
      }

      const start = new Date(
        Date.UTC(
          year,
          month - 1,
          1,
        ),
      );

      const endExclusive =
        new Date(
          Date.UTC(
            month === 12
              ? year + 1
              : year,

            month === 12
              ? 0
              : month,

            1,
          ),
        );

      where.requestedAt = {
        gte: start,
        lt: endExclusive,
      };
    }

    const search =
      params.search?.trim();

    if (search) {
      where.OR = [
        {
          refundNumber: {
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
          accountName: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          customerName: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          customerEmail: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          reason: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const [
      rows,
      total,
      totalsRows,
    ] =
      await this.prisma.$transaction([
        this.prisma.refundRequest.findMany({
          where,

          include: {
            account: {
              select: {
                id: true,
                name: true,
              },
            },

            paymentLink: {
              select: {
                id: true,
                totalAmount: true,
                paidAt: true,
                paymentUrl: true,
              },
            },
          },

          orderBy: {
            requestedAt: 'desc',
          },

          skip:
            (page - 1) *
            limit,

          take: limit,
        }),

        this.prisma.refundRequest.count({
          where,
        }),

        this.prisma.refundRequest.findMany({
          where,

          select: {
            refundAmount: true,
            status: true,
          },
        }),
      ]);

    const summary =
      totalsRows.reduce(
        (totals, row) => {
          totals.requestedAmount +=
            row.refundAmount;

          if (
            row.status ===
            RefundStatus.REFUNDED
          ) {
            totals.refundedAmount +=
              row.refundAmount;

            totals.refundedCount +=
              1;
          }

          if (
            row.status ===
            RefundStatus.REQUESTED
          ) {
            totals.requestedCount +=
              1;
          }

          if (
            row.status ===
            RefundStatus.PROCESSING
          ) {
            totals.processingCount +=
              1;
          }

          if (
            row.status ===
            RefundStatus.REJECTED
          ) {
            totals.rejectedCount +=
              1;
          }

          if (
            row.status ===
            RefundStatus.FAILED
          ) {
            totals.failedCount +=
              1;
          }

          return totals;
        },
        {
          requestedAmount: 0,
          refundedAmount: 0,
          requestedCount: 0,
          processingCount: 0,
          refundedCount: 0,
          rejectedCount: 0,
          failedCount: 0,
        },
      );

    return {
      data: rows,

      summary: {
        refundCount: total,

        requestedAmount:
          this.roundMoney(
            summary.requestedAmount,
          ),

        refundedAmount:
          this.roundMoney(
            summary.refundedAmount,
          ),

        requestedCount:
          summary.requestedCount,

        processingCount:
          summary.processingCount,

        refundedCount:
          summary.refundedCount,

        rejectedCount:
          summary.rejectedCount,

        failedCount:
          summary.failedCount,
      },

      pagination: {
        total,
        page,
        limit,

        totalPages:
          Math.max(
            1,
            Math.ceil(
              total / limit,
            ),
          ),
      },
    };
  }

  async create(
    dto: CreateRefundRequestDto,
  ) {
    const paymentLink =
      await this.prisma.paymentLink.findUnique({
        where: {
          id: dto.paymentLinkId,
        },

        include: {
          account: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

    if (!paymentLink) {
      throw new NotFoundException(
        'Payment link not found',
      );
    }

    if (
      paymentLink.status !==
      PaymentLinkStatus.PAID
    ) {
      throw new BadRequestException(
        'Only paid payment links can be refunded',
      );
    }

    if (
      !paymentLink.stripePaymentIntentId
    ) {
      throw new BadRequestException(
        'This paid record has no Stripe PaymentIntent to refund',
      );
    }

    const amount =
      this.roundMoney(
        Number(dto.amount),
      );

    const reserved =
      await this.getReservedRefundAmount(
        paymentLink.id,
      );

    const remaining =
      this.roundMoney(
        Math.max(
          paymentLink.totalAmount -
          reserved,
          0,
        ),
      );

    if (
      amount <= 0 ||
      amount > remaining
    ) {
      throw new BadRequestException(
        `Refund amount cannot exceed the remaining refundable amount of £${remaining.toFixed(
          2,
        )}`,
      );
    }

    const row =
      await this.prisma.refundRequest.create({
        data: {
          refundNumber:
            this.generateRefundNumber(),

          paymentLinkId:
            paymentLink.id,

          bookingId:
            paymentLink.bookingId,

          accountId:
            paymentLink.accountId,

          bookingReference:
            paymentLink.bookingReference,

          accountName:
            paymentLink.account?.name ??
            paymentLink.accountName,

          customerName:
            paymentLink.customerName,

          customerEmail:
            paymentLink.customerEmail,

          currency:
            paymentLink.currency,

          stripePaymentIntentId:
            paymentLink.stripePaymentIntentId,

          originalAmount:
            paymentLink.totalAmount,

          refundAmount:
            amount,

          reason:
            dto.reason.trim(),

          adminNote:
            dto.adminNote?.trim() ||
            null,

          status:
            RefundStatus.REQUESTED,
        },

        include: {
          account: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

    return {
      message:
        'Refund request created',
      refund: row,
    };
  }

  async approve(id: string) {
    const row =
      await this.prisma.refundRequest.findUnique({
        where: {
          id,
        },

        include: {
          paymentLink: true,
        },
      });

    if (!row) {
      throw new NotFoundException(
        'Refund request not found',
      );
    }

    if (
      row.status !==
      RefundStatus.REQUESTED
    ) {
      throw new BadRequestException(
        'Only requested refunds can be approved',
      );
    }

    if (
      !row.paymentLink ||
      !row.stripePaymentIntentId
    ) {
      throw new BadRequestException(
        'The original Stripe payment is unavailable',
      );
    }

    const otherReserved =
      await this.getReservedRefundAmount(
        row.paymentLink.id,
        row.id,
      );

    const remaining =
      this.roundMoney(
        Math.max(
          row.paymentLink.totalAmount -
          otherReserved,
          0,
        ),
      );

    if (
      row.refundAmount >
      remaining
    ) {
      throw new BadRequestException(
        `Only £${remaining.toFixed(
          2,
        )} remains refundable on the original payment`,
      );
    }

    const stripe =
      this.getStripe();

    const refund =
      await stripe.refunds.create(
        {
          payment_intent:
            row.stripePaymentIntentId,

          amount:
            this.moneyToMinor(
              row.refundAmount,
            ),

          metadata: {
            refundRequestId:
              row.id,

            refundNumber:
              row.refundNumber,

            paymentLinkId:
              row.paymentLink.id,

            bookingId:
              row.bookingId || '',
          },
        },
        {
          idempotencyKey:
            `5ab-refund-${row.id}`,
        },
      );

    const nextStatus =
      this.mapStripeRefundStatus(
        refund,
      );

    const now = new Date();

    const updated =
      await this.prisma.refundRequest.update({
        where: {
          id: row.id,
        },

        data: {
          status: nextStatus,

          stripeRefundId:
            refund.id,

          approvedAt:
            now,

          processedAt:
            nextStatus ===
              RefundStatus.REFUNDED
              ? now
              : null,

          failedAt:
            nextStatus ===
              RefundStatus.FAILED
              ? now
              : null,
        },
      });

    return {
      message:
        nextStatus ===
          RefundStatus.REFUNDED
          ? 'Refund completed successfully'
          : nextStatus ===
            RefundStatus.PROCESSING
            ? 'Refund approved and is processing'
            : 'Stripe refund failed',

      refund: updated,
    };
  }

  async reject(
    id: string,
    dto: RejectRefundRequestDto,
  ) {
    const row =
      await this.prisma.refundRequest.findUnique({
        where: {
          id,
        },
      });

    if (!row) {
      throw new NotFoundException(
        'Refund request not found',
      );
    }

    if (
      row.status !==
      RefundStatus.REQUESTED
    ) {
      throw new BadRequestException(
        'Only requested refunds can be rejected',
      );
    }

    const updated =
      await this.prisma.refundRequest.update({
        where: {
          id,
        },

        data: {
          status:
            RefundStatus.REJECTED,

          rejectedAt:
            new Date(),

          ...(dto.adminNote?.trim()
            ? {
              adminNote:
                dto.adminNote.trim(),
            }
            : {}),
        },
      });

    return {
      message:
        'Refund request rejected',
      refund: updated,
    };
  }

  async sync(id: string) {
    const row =
      await this.prisma.refundRequest.findUnique({
        where: {
          id,
        },
      });

    if (!row) {
      throw new NotFoundException(
        'Refund request not found',
      );
    }

    if (!row.stripeRefundId) {
      throw new BadRequestException(
        'This refund has not been submitted to Stripe yet',
      );
    }

    const stripe =
      this.getStripe();

    const refund =
      await stripe.refunds.retrieve(
        row.stripeRefundId,
      );

    const nextStatus =
      this.mapStripeRefundStatus(
        refund,
      );

    const now = new Date();

    const updated =
      await this.prisma.refundRequest.update({
        where: {
          id: row.id,
        },

        data: {
          status: nextStatus,

          processedAt:
            nextStatus ===
              RefundStatus.REFUNDED
              ? row.processedAt ??
              now
              : row.processedAt,

          failedAt:
            nextStatus ===
              RefundStatus.FAILED
              ? row.failedAt ??
              now
              : row.failedAt,
        },
      });

    return {
      message:
        'Refund status synced from Stripe',
      refund: updated,
    };
  }
}
