import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
import { PaymentLinksService } from './payment-links.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('finance/payment-links')
export class PaymentLinksController {
  constructor(
    private readonly paymentLinksService: PaymentLinksService,
  ) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('month') month?: string,
    @Query('accountId') accountId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentLinksService.list({
      search,
      status,
      month,
      accountId,
      page,
      limit,
    });
  }

  @Get('booking-search')
  searchBookings(
    @Query('search') search?: string,
  ) {
    return this.paymentLinksService.searchBookings(search);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
  ) {
    return this.paymentLinksService.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreatePaymentLinkDto,
  ) {
    return this.paymentLinksService.create(dto);
  }

  @Post(':id/sync')
  sync(
    @Param('id') id: string,
  ) {
    return this.paymentLinksService.sync(id);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id') id: string,
  ) {
    return this.paymentLinksService.cancel(id);
  }
}

/*
 * Public Stripe webhook endpoint.
 *
 * Do NOT add JwtAuthGuard here.
 * Authenticity is established by Stripe's signed raw request body.
 */
@Controller('finance/payment-links')
export class PaymentLinksWebhookController {
  constructor(
    private readonly paymentLinksService: PaymentLinksService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req()
    req: RawBodyRequest<Request>,

    @Headers('stripe-signature')
    signature?: string,
  ) {
    if (!signature) {
      throw new BadRequestException(
        'Missing Stripe signature',
      );
    }

    if (!req.rawBody) {
      throw new BadRequestException(
        'Raw request body is unavailable. Enable rawBody in NestFactory.create().',
      );
    }

    const event =
      this.paymentLinksService.constructStripeEvent(
        req.rawBody,
        signature,
      );

    return this.paymentLinksService.handleStripeEvent(event);
  }
}
