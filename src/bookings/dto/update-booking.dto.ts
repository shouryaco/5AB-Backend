import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsUUID } from 'class-validator';

import { CreateBookingDto } from './create-booking.dto';

class UpdateBookingBaseDto extends PartialType(
  OmitType(CreateBookingDto, ['accountId', 'assignedDriverId'] as const),
) {}

export class UpdateBookingDto extends UpdateBookingBaseDto {
  @IsOptional()
  @IsUUID()
  accountId?: string | null;

  @IsOptional()
  @IsUUID()
  assignedDriverId?: string | null;
}
