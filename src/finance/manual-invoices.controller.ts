import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { CreateManualInvoiceDto } from './dto/create-manual-invoice.dto';
import { ManualInvoicesService } from './manual-invoices.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('finance/manual-invoices')
export class ManualInvoicesController {
  constructor(
    private readonly manualInvoicesService: ManualInvoicesService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateManualInvoiceDto,
  ) {
    return this.manualInvoicesService.create(dto);
  }
}
