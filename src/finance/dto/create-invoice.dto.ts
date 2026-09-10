import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { InvoiceGrouping } from '@prisma/client';

export class CreateInvoiceDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be in YYYY-MM format',
  })
  month!: string;

  @IsUUID()
  accountId!: string;

  @IsOptional()
  @IsUUID()
  bookerId?: string;

  @IsOptional()
  @IsEnum(InvoiceGrouping)
  grouping?: InvoiceGrouping;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  adjustmentTotal?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
