import { IsOptional, IsUUID, Matches } from 'class-validator';

export class PreviewInvoiceDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be in YYYY-MM format',
  })
  month!: string;

  @IsUUID()
  accountId!: string;

  @IsOptional()
  @IsUUID()
  bookerId?: string;
}
