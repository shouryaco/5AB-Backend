import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateBookingDto {
  @IsString()
  bookingReference: string;

  @IsString()
  customerName: string;

  @IsString()
  customerPhone: string;

  @IsOptional()
  @IsString()
  customerEmail?: string;

  @IsString()
  pickupAddress: string;

  @IsString()
  dropoffAddress: string;

  @IsDateString()
  pickupDatetime: string;

  @IsOptional()
  @IsString()
  journeyType?: string;

  @IsOptional()
  @IsInt()
  passengers?: number;

  @IsOptional()
  @IsInt()
  luggage?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}