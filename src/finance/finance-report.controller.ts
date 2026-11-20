import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { FinanceReportService } from './finance-report.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('finance/reports')
export class FinanceReportController {
  constructor(
    private readonly financeReportService: FinanceReportService,
  ) {}

  @Get('bookings')
  getBookingFinanceReport(
    @Query('month') month?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('driverId') driverId?: string,
    @Query('vehicle') vehicle?: string,
    @Query('search') search?: string,
  ) {
    return this.financeReportService.getReport({
      month,
      from,
      to,
      accountId,
      driverId,
      vehicle,
      search,
    });
  }
}
