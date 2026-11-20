import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { DriverPaymentsService } from './driver-payments.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('finance/driver-statements')
export class DriverPaymentsController {
  constructor(
    private readonly driverPaymentsService: DriverPaymentsService,
  ) {}

  @Get()
  list(
    @Query('month') month?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('driverId') driverId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.driverPaymentsService.list({
      month,
      search,
      status,
      driverId,
      page,
      limit,
    });
  }

  @Get(':statementId')
  findOne(
    @Param('statementId') statementId: string,
  ) {
    return this.driverPaymentsService.findOne(statementId);
  }

  @Patch(':statementId/paid')
  markPaid(
    @Param('statementId') statementId: string,
    @Body() body: { paidAt?: string },
  ) {
    return this.driverPaymentsService.markPaid(
      statementId,
      body?.paidAt,
    );
  }

  @Patch(':statementId/unpaid')
  markUnpaid(
    @Param('statementId') statementId: string,
  ) {
    return this.driverPaymentsService.markUnpaid(statementId);
  }
}
