import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

import { DriverAccountStatus, DriverStatus } from '@prisma/client';

export class CreateDriverDto {
  /*
   * Compatibility
   *
   * Existing frontend currently sends "name".
   * New frontend will send firstName + lastName.
   */
  @IsOptional()
  @IsString()
  name?: string;

  // Personal Details

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  alternatePhone?: string;

  @IsOptional()
  @IsString()
  driverType?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /*
   * If supplied together with email,
   * a DRIVER User account will be created.
   */
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  streetTown?: string;

  @IsOptional()
  @IsString()
  postCode?: string;

  @IsOptional()
  @IsString()
  photo?: string;

  @IsOptional()
  @IsDateString()
  companyJoiningDate?: string;

  @IsOptional()
  @IsString()
  taxInformation?: string;

  // Account

  @IsOptional()
  @IsEnum(DriverAccountStatus)
  accountStatus?: DriverAccountStatus;

  @IsOptional()
  @IsDateString()
  activeDate?: string;

  @IsOptional()
  @IsString()
  callSign?: string;

  @IsOptional()
  @IsString()
  driverGrade?: string;

  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;

  // Experience

  @IsOptional()
  @IsString()
  dvlaCode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  drivingLicencePoints?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  drivingSinceMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  drivingSinceYear?: number;

  @IsOptional()
  @IsString()
  previouslyWorkedCompanies?: string;

  // Bank & Finance

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountHolderName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  sortCode?: string;

  @IsOptional()
  @IsString()
  signedProofDocumentUrl?: string;

  @IsOptional()
  @IsString()
  statementCycle?: string;

  @IsOptional()
  @IsString()
  paymentCycle?: string;

  @IsOptional()
  @IsString()
  paymentDueDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultCommission?: number;

  // Notes

  @IsOptional()
  @IsString()
  profileNote?: string;

  @IsOptional()
  @IsString()
  controllerNote?: string;

  /*
   * Temporary compatibility fields.
   * We will move actual vehicle management
   * into Vehicle[] next.
   */
  @IsOptional()
  @IsString()
  vehicleName?: string;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;
}
