import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { MarkInvoicePaidDto } from './dto/mark-invoice-paid.dto';
import { PreviewInvoiceDto } from './dto/preview-invoice.dto';
import { QueryInvoiceSummaryDto } from './dto/query-invoice-summary.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { UpdateBillingSettingsDto } from './dto/update-billing-settings.dto';
import { FinanceService } from './finance.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('accounts/:accountId/billing-settings')
  getBillingSettings(@Param('accountId') accountId: string) {
    return this.financeService.getBillingSettings(accountId);
  }

  @Patch('accounts/:accountId/billing-settings')
  updateBillingSettings(
    @Param('accountId') accountId: string,
    @Body() dto: UpdateBillingSettingsDto,
  ) {
    return this.financeService.updateBillingSettings(accountId, dto);
  }

  @Get('invoices/preview')
  previewInvoice(@Query() query: PreviewInvoiceDto) {
    return this.financeService.previewInvoice(query);
  }

  @Get('invoices/summary')
  getInvoiceSummary(@Query() query: QueryInvoiceSummaryDto) {
    return this.financeService.getInvoiceSummary(query);
  }

  @Get('invoices')
  findInvoices(@Query() query: QueryInvoicesDto) {
    return this.financeService.findInvoices(query);
  }

  @Get('invoices/:id')
  findInvoice(@Param('id') id: string) {
    return this.financeService.findInvoice(id);
  }

  @Post('invoices')
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.financeService.createInvoice(dto);
  }

  @Patch('invoices/:id/issue')
  issueInvoice(@Param('id') id: string) {
    return this.financeService.issueInvoice(id);
  }

  @Patch('invoices/:id/mark-paid')
  markInvoicePaid(
    @Param('id') id: string,
    @Body() dto: MarkInvoicePaidDto,
  ) {
    return this.financeService.markInvoicePaid(id, dto);
  }

  @Patch('invoices/:id/void')
  voidInvoice(@Param('id') id: string) {
    return this.financeService.voidInvoice(id);
  }
}
