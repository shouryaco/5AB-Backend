import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

import { VehicleStatus } from '@prisma/client';

export class CreateVehicleDto {
  @IsOptional()
  @IsString()
  vehicleCategory?: string;

  @IsString()
  vehicleType!: string;

  @IsString()
  registrationNumber!: string;

  @IsOptional()
  @IsString()
  keeperName?: string;

  @IsOptional()
  @IsString()
  keeperAddress?: string;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @IsOptional()
  @IsDateString()
  companyJoiningDate?: string;

  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
