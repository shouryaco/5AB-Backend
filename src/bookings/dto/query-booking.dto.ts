import {
  IsOptional,
  IsString,
  IsBooleanString,
  IsNumberString,
} from 'class-validator';

export class QueryBookingDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBooleanString()
  upcoming?: string;

  @IsOptional()
  @IsBooleanString()
  active?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
