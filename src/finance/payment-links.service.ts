import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  PaymentLinkStatus,
  Prisma,
} from '@prisma/client';

import { randomUUID } from 'crypto';
import Stripe from 'stripe';

import { PrismaService } from '../prisma/prisma.service';

import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';

@Injectable()
export class PaymentLinksService {
  constructor(private readonly prisma: PrismaService) {}

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

  private getSuccessUrl() {
    const value = process.env.PAYMENT_SUCCESS_URL?.trim();

    if (!value) {
      throw new ServiceUnavailableException(
        'PAYMENT_SUCCESS_URL is not configured.',
      );
    }

    return value;
  }

  private getCancelUrl() {
    const value = process.env.PAYMENT_CANCEL_URL?.trim();

    if (!value) {
      throw new ServiceUnavailableException(
        'PAYMENT_CANCEL_URL is not configured.',
      );
    }

    return value;
  }

  private extractPaymentIntentId(
    session: Stripe.Checkout.Session,
  ) {
    if (!session.payment_intent) {
      return null;
    }

    if (typeof session.payment_intent === 'string') {
      return session.payment_intent;
    }

    return session.payment_intent.id;
  }

  private async updateFromSession(
    paymentLinkId: string,
    session: Stripe.Checkout.Session,
  ) {
    const paymentIntentId =
      this.extractPaymentIntentId(session);

    if (session.payment_status === 'paid') {
      return this.prisma.paymentLink.update({
        where: { id: paymentLinkId },
        data: {
          status: PaymentLinkStatus.PAID,
          paidAt: new Date(),
          stripePaymentIntentId: paymentIntentId,
        },
      });
    }

    if (session.status === 'expired') {
      return this.prisma.paymentLink.update({
        where: { id: paymentLinkId },
        data: {
          status: PaymentLinkStatus.EXPIRED,
          stripePaymentIntentId: paymentIntentId,
        },
      });
    }

    return this.prisma.paymentLink.update({
      where: { id: paymentLinkId },
      data: {
        stripePaymentIntentId: paymentIntentId,
      },
    });
  }

  async searchBookings(search?: string) {
    const cleanSearch = search?.trim();

    if (!cleanSearch || cleanSearch.length < 2) {
      return [];
    }

    const bookings = await this.prisma.booking.findMany({
      where: {
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
            customerEmail: {
              contains: cleanSearch,
              mode: 'insensitive',
            },
          },
        ],
      },

      select: {
        id: true,
        bookingReference: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        pickupDatetime: true,
        pickupAddress: true,
        dropoffAddress: true,
        status: true,

        account: {
          select: {
            id: true,
            name: true,
          },
        },

        finance: {
          select: {
            clientNet: true,
            clientVat: true,
            clientTotalAmount: true,
            paymentType: true,
          },
        },
      },

      orderBy: {
        pickupDatetime: 'desc',
      },

      take: 20,
    });

    return bookings.map((booking) => {
      const vat = booking.finance?.clientVat ?? 0;

      const net =
        booking.finance?.clientNet ??
        Math.max(
          (booking.finance?.clientTotalAmount ?? 0) - vat,
          0,
        );

      const gross =
        booking.finance?.clientTotalAmount ??
        this.roundMoney(net + vat);

      return {
        ...booking,
        financeSnapshot: {
          net: this.roundMoney(net),
          vat: this.roundMoney(vat),
          gross: this.roundMoney(gross),
        },
      };
    });
  }

  async list(params: {
    search?: string;
    status?: string;
    month?: string;
    accountId?: string;
    page?: string;
    limit?: string;
  }) {
    const page = Math.max(Number(params.page || 1) || 1, 1);

    const limit = Math.min(
      Math.max(Number(params.limit || 50) || 50, 1),
      250,
    );

    const where: Prisma.PaymentLinkWhereInput = {};

    if (params.accountId?.trim()) {
      where.accountId = params.accountId.trim();
    }

    if (params.status?.trim()) {
      const status = params.status.trim().toUpperCase();

      if (
        !Object.values(PaymentLinkStatus).includes(
          status as PaymentLinkStatus,
        )
      ) {
        throw new BadRequestException(
          'Invalid payment link status',
        );
      }

      where.status = status as PaymentLinkStatus;
    }

    if (params.month?.trim()) {
      const match =
        /^(\d{4})-(\d{2})$/.exec(params.month.trim());

      if (!match) {
        throw new BadRequestException(
          'Month must be in YYYY-MM format',
        );
      }

      const year = Number(match[1]);
      const month = Number(match[2]);

      if (month < 1 || month > 12) {
        throw new BadRequestException('Invalid month');
      }

      const start = new Date(
        Date.UTC(year, month - 1, 1),
      );

      const endExclusive = new Date(
        Date.UTC(
          month === 12 ? year + 1 : year,
          month === 12 ? 0 : month,
          1,
        ),
      );

      where.createdAt = {
        gte: start,
        lt: endExclusive,
      };
    }

    const search = params.search?.trim();

    if (search) {
      where.OR = [
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
          remarks: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const [rows, total, allForTotals] =
      await this.prisma.$transaction([
        this.prisma.paymentLink.findMany({
          where,
          include: {
            account: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip: (page - 1) * limit,
          take: limit,
        }),

        this.prisma.paymentLink.count({
          where,
        }),

        this.prisma.paymentLink.findMany({
          where,
          select: {
            status: true,
            netAmount: true,
            vatAmount: true,
            grossAmount: true,
            cardCharge: true,
            totalAmount: true,
          },
        }),
      ]);

    const summary = allForTotals.reduce(
      (totals, row) => {
        totals.net += row.netAmount;
        totals.vat += row.vatAmount;
        totals.gross += row.grossAmount;
        totals.cardCharge += row.cardCharge;
        totals.total += row.totalAmount;

        if (row.status === PaymentLinkStatus.PAID) {
          totals.paid += row.totalAmount;
          totals.paidCount += 1;
        }

        if (row.status === PaymentLinkStatus.PENDING) {
          totals.pendingCount += 1;
        }

        return totals;
      },
      {
        net: 0,
        vat: 0,
        gross: 0,
        cardCharge: 0,
        total: 0,
        paid: 0,
        paidCount: 0,
        pendingCount: 0,
      },
    );

    return {
      data: rows,

      summary: {
        linkCount: total,
        net: this.roundMoney(summary.net),
        vat: this.roundMoney(summary.vat),
        gross: this.roundMoney(summary.gross),
        cardCharge: this.roundMoney(summary.cardCharge),
        total: this.roundMoney(summary.total),
        paid: this.roundMoney(summary.paid),
        paidCount: summary.paidCount,
        pendingCount: summary.pendingCount,
      },

      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(id: string) {
    const row = await this.prisma.paymentLink.findUnique({
      where: { id },
      include: {
        account: true,
        booking: {
          select: {
            id: true,
            bookingReference: true,
            pickupDatetime: true,
            pickupAddress: true,
            dropoffAddress: true,
            status: true,
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Payment link not found');
    }

    return row;
  }

  async create(dto: CreatePaymentLinkDto) {
    const stripe = this.getStripe();

    let account:
      | {
          id: string;
          name: string;
        }
      | null = null;

    if (dto.accountId) {
      account = await this.prisma.clientAccount.findUnique({
        where: { id: dto.accountId },
        select: {
          id: true,
          name: true,
        },
      });

      if (!account) {
        throw new NotFoundException(
          'Client account not found',
        );
      }
    }

    let booking:
      | {
          id: string;
          bookingReference: string;
          accountId: string | null;
        }
      | null = null;

    if (dto.bookingId) {
      booking = await this.prisma.booking.findUnique({
        where: { id: dto.bookingId },
        select: {
          id: true,
          bookingReference: true,
          accountId: true,
        },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (
        dto.accountId &&
        booking.accountId &&
        dto.accountId !== booking.accountId
      ) {
        throw new BadRequestException(
          'Selected booking does not belong to the selected account',
        );
      }
    }

    const customerName = dto.customerName.trim();
    const customerEmail =
      dto.customerEmail.trim().toLowerCase();
    const remarks = dto.remarks?.trim() || null;

    const netAmount = this.roundMoney(dto.netAmount);
    const vatAmount = this.roundMoney(dto.vatAmount);
    const grossAmount = this.roundMoney(
      netAmount + vatAmount,
    );
    const cardCharge = this.roundMoney(dto.cardCharge);
    const totalAmount = this.roundMoney(
      grossAmount + cardCharge,
    );

    if (totalAmount <= 0) {
      throw new BadRequestException(
        'Payment link total must be greater than £0.00',
      );
    }

    const paymentLinkId = randomUUID();
    const expiryHours = dto.expiryHours ?? 24;

    const expiresAt = new Date(
      Date.now() + expiryHours * 60 * 60 * 1000,
    );

    const descriptionParts = [
      booking?.bookingReference
        ? `Job ${booking.bookingReference}`
        : null,
      remarks,
    ].filter(Boolean);

    let session: Stripe.Checkout.Session | null = null;

    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: customerEmail,
        success_url: this.getSuccessUrl(),
        cancel_url: this.getCancelUrl(),
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'gbp',
              unit_amount: this.moneyToMinor(totalAmount),
              product_data: {
                name: '5AB Chauffeur Services',
                description:
                  descriptionParts.join(' — ') ||
                  'Chauffeur services payment',
              },
            },
          },
        ],

        metadata: {
          paymentLinkId,
          bookingId: booking?.id || '',
          bookingReference:
            booking?.bookingReference || '',
        },

        payment_intent_data: {
          metadata: {
            paymentLinkId,
            bookingId: booking?.id || '',
            bookingReference:
              booking?.bookingReference || '',
          },
        },
      });

      if (!session.url) {
        throw new ServiceUnavailableException(
          'Stripe did not return a Checkout URL',
        );
      }

      const row = await this.prisma.paymentLink.create({
        data: {
          id: paymentLinkId,

          accountId:
            account?.id ?? booking?.accountId ?? null,

          bookingId: booking?.id ?? null,
          bookingReference:
            booking?.bookingReference ?? null,
          accountName: account?.name ?? null,

          customerName,
          customerEmail,
          remarks,

          currency: 'GBP',

          netAmount,
          vatAmount,
          grossAmount,
          cardCharge,
          totalAmount,

          status: PaymentLinkStatus.PENDING,
          provider: 'STRIPE',

          stripeCheckoutSessionId: session.id,
          paymentUrl: session.url,
          expiresAt,
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
        message: 'Payment link created successfully',
        paymentLink: row,
      };
    } catch (error) {
      if (session?.id) {
        try {
          await stripe.checkout.sessions.expire(session.id);
        } catch {
          // Best-effort cleanup only.
        }
      }

      throw error;
    }
  }

  async sync(id: string) {
    const row = await this.prisma.paymentLink.findUnique({
      where: { id },
    });

    if (!row) {
      throw new NotFoundException('Payment link not found');
    }

    if (!row.stripeCheckoutSessionId) {
      throw new BadRequestException(
        'This payment link has no Stripe Checkout Session',
      );
    }

    const stripe = this.getStripe();

    const session = await stripe.checkout.sessions.retrieve(
      row.stripeCheckoutSessionId,
    );

    const updated = await this.updateFromSession(
      row.id,
      session,
    );

    return {
      message: 'Payment link status synced from Stripe',
      paymentLink: updated,
    };
  }

  async cancel(id: string) {
    const row = await this.prisma.paymentLink.findUnique({
      where: { id },
    });

    if (!row) {
      throw new NotFoundException('Payment link not found');
    }

    if (row.status === PaymentLinkStatus.PAID) {
      throw new BadRequestException(
        'A paid payment link cannot be cancelled',
      );
    }

    if (row.status === PaymentLinkStatus.CANCELLED) {
      throw new BadRequestException(
        'Payment link is already cancelled',
      );
    }

    if (row.stripeCheckoutSessionId) {
      try {
        const stripe = this.getStripe();

        const session = await stripe.checkout.sessions.retrieve(
          row.stripeCheckoutSessionId,
        );

        if (session.status === 'open') {
          await stripe.checkout.sessions.expire(
            row.stripeCheckoutSessionId,
          );
        }
      } catch (error) {
        console.error(
          'Stripe session expiry failed during payment-link cancellation:',
          error,
        );
      }
    }

    const updated = await this.prisma.paymentLink.update({
      where: { id },
      data: {
        status: PaymentLinkStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    return {
      message: 'Payment link cancelled',
      paymentLink: updated,
    };
  }

  async handleStripeEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired': {
        const session =
          event.data.object as Stripe.Checkout.Session;

        const paymentLinkId =
          session.metadata?.paymentLinkId;

        if (!paymentLinkId) {
          return { received: true, ignored: true };
        }

        const existing =
          await this.prisma.paymentLink.findUnique({
            where: { id: paymentLinkId },
          });

        if (!existing) {
          return { received: true, ignored: true };
        }

        if (
          event.type ===
          'checkout.session.async_payment_failed'
        ) {
          if (existing.status !== PaymentLinkStatus.PAID) {
            await this.prisma.paymentLink.update({
              where: { id: paymentLinkId },
              data: {
                status: PaymentLinkStatus.FAILED,
                stripePaymentIntentId:
                  this.extractPaymentIntentId(session),
              },
            });
          }

          return { received: true };
        }

        if (event.type === 'checkout.session.expired') {
          if (
            existing.status !== PaymentLinkStatus.PAID &&
            existing.status !== PaymentLinkStatus.CANCELLED
          ) {
            await this.prisma.paymentLink.update({
              where: { id: paymentLinkId },
              data: {
                status: PaymentLinkStatus.EXPIRED,
                stripePaymentIntentId:
                  this.extractPaymentIntentId(session),
              },
            });
          }

          return { received: true };
        }

        if (existing.status !== PaymentLinkStatus.CANCELLED) {
          await this.updateFromSession(
            paymentLinkId,
            session,
          );
        }

        return { received: true };
      }

      case 'payment_intent.payment_failed': {
        const intent =
          event.data.object as Stripe.PaymentIntent;

        const paymentLinkId =
          intent.metadata?.paymentLinkId;

        if (!paymentLinkId) {
          return { received: true, ignored: true };
        }

        const existing =
          await this.prisma.paymentLink.findUnique({
            where: { id: paymentLinkId },
          });

        if (
          existing &&
          existing.status !== PaymentLinkStatus.PAID &&
          existing.status !== PaymentLinkStatus.CANCELLED
        ) {
          await this.prisma.paymentLink.update({
            where: { id: paymentLinkId },
            data: {
              status: PaymentLinkStatus.FAILED,
              stripePaymentIntentId: intent.id,
            },
          });
        }

        return { received: true };
      }

      default:
        return { received: true, ignored: true };
    }
  }

  constructStripeEvent(
    rawBody: Buffer,
    signature: string,
  ): Stripe.Event {
    const webhookSecret =
      process.env.STRIPE_WEBHOOK_SECRET?.trim();

    if (!webhookSecret) {
      throw new ServiceUnavailableException(
        'STRIPE_WEBHOOK_SECRET is not configured',
      );
    }

    return this.getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  }
}
