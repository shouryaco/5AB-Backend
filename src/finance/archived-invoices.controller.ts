import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { ArchivedInvoicesService } from './archived-invoices.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('finance/archived-invoices')
export class ArchivedInvoicesController {
  constructor(
    private readonly archivedInvoicesService: ArchivedInvoicesService,
  ) {}

  @Get()
  list(
    @Query('month') month?: string,
    @Query('accountId') accountId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.archivedInvoicesService.list({
      month,
      accountId,
      search,
      page,
      limit,
    });
  }
}
