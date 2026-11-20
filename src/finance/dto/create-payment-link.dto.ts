import { Type } from 'class-transformer';

import {
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePaymentLinkDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @IsString()
  @MinLength(1)
  customerName: string;

  @IsEmail()
  customerEmail: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  netAmount: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vatAmount: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cardCharge: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  expiryHours?: number;
}
