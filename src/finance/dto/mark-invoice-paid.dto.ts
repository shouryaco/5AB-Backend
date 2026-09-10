import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class MarkInvoicePaidDto {
  /**
   * Payment amount to add to the invoice.
   * If omitted, the full outstanding balance is marked as paid.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;
}
