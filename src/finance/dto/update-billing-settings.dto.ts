import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { InvoiceGrouping } from '@prisma/client';

export class UpdateBillingSettingsDto {
  @IsOptional()
  @IsEmail()
  invoiceEmail?: string | null;

  @IsOptional()
  @IsEnum(InvoiceGrouping)
  invoiceGrouping?: InvoiceGrouping;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  invoiceDueDays?: number;
}
