import { IsISO8601, IsOptional } from 'class-validator';

export class MarkDriverStatementPaidDto {
  @IsOptional()
  @IsISO8601()
  paidAt?: string;
}
