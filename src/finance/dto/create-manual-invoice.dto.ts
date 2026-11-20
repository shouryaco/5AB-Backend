import { Type } from 'class-transformer';

import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateManualInvoiceLineDto {
  @IsString()
  @MinLength(1)
  description: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  vatPercent: number;
}

export class CreateManualInvoiceDto {
  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsUUID()
  bookerId?: string;

  @IsString()
  invoiceDate: string;

  @IsOptional()
  @IsString()
  billingName?: string;

  @IsOptional()
  @IsEmail()
  billingEmail?: string;

  @IsOptional()
  @IsString()
  billingAddress?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  issueNow?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateManualInvoiceLineDto)
  lines: CreateManualInvoiceLineDto[];
}
