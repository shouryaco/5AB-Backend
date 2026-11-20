import { Module } from '@nestjs/common';

import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { DriverPaymentsController } from './driver-payments.controller';
import { DriverPaymentsService } from './driver-payments.service';
import { FinanceReportController } from './finance-report.controller';
import { FinanceReportService } from './finance-report.service';
import { ArchivedInvoicesController } from './archived-invoices.controller';
import { ArchivedInvoicesService } from './archived-invoices.service';
import { ManualInvoicesController } from './manual-invoices.controller';
import { ManualInvoicesService } from './manual-invoices.service';

import {
  PaymentLinksController,
  PaymentLinksWebhookController,
} from './payment-links.controller';

import { PaymentLinksService } from './payment-links.service';

import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';


@Module({
  controllers: [FinanceController, DriverPaymentsController, FinanceReportController, ArchivedInvoicesController, ManualInvoicesController, PaymentLinksController,
    PaymentLinksWebhookController,RefundsController],
  providers: [FinanceService, DriverPaymentsService, FinanceReportService, ArchivedInvoicesService, ManualInvoicesService, PaymentLinksService,RefundsService],
  exports: [FinanceService],
})
export class FinanceModule { }
