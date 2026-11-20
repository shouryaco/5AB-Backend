import { Type } from 'class-transformer';

import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRefundRequestDto {
  @IsUUID()
  paymentLinkId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @MinLength(2)
  reason: string;

  @IsOptional()
  @IsString()
  adminNote?: string;
}
