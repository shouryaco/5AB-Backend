import { Type } from 'class-transformer';

import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/* =====================================================
   BOOKER LINK
===================================================== */

export class BookingBookerInputDto {
  @IsUUID()
  bookerId!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

/* =====================================================
   PASSENGER LINK
===================================================== */

export class BookingPassengerInputDto {
  @IsOptional()
  @IsString()
  bookingReference?: string;

  @IsUUID()
  passengerId!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

/* =====================================================
   VIA
===================================================== */

export class BookingViaInputDto {
  @IsString()
  address!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}

/* =====================================================
   FINANCE
===================================================== */

export class BookingFinanceInputDto {
  /* ---------------- CLIENT SIDE ---------------- */

  @IsOptional()
  @IsNumber()
  clientQuote?: number;

  @IsOptional()
  @IsNumber()
  clientWaitingCharge?: number;

  @IsOptional()
  @IsNumber()
  clientParking?: number;

  @IsOptional()
  @IsNumber()
  clientCongestion?: number;

  @IsOptional()
  @IsNumber()
  clientDiscount?: number;

  @IsOptional()
  @IsNumber()
  clientTotal?: number;

  @IsOptional()
  @IsNumber()
  clientAdminFee?: number;

  @IsOptional()
  @IsNumber()
  clientNet?: number;

  @IsOptional()
  @IsNumber()
  clientVat?: number;

  @IsOptional()
  @IsNumber()
  clientVatPercent?: number;

  @IsOptional()
  @IsNumber()
  clientTotalAmount?: number;

  @IsOptional()
  @IsBoolean()
  clientWaitingIncluded?: boolean;

  @IsOptional()
  @IsBoolean()
  clientParkingIncluded?: boolean;

  @IsOptional()
  @IsBoolean()
  clientPriceOverride?: boolean;

  /* ---------------- DRIVER SIDE ---------------- */

  @IsOptional()
  @IsNumber()
  driverCost?: number;

  @IsOptional()
  @IsNumber()
  driverWaitingPay?: number;

  @IsOptional()
  @IsNumber()
  driverParking?: number;

  @IsOptional()
  @IsNumber()
  driverCongestion?: number;

  @IsOptional()
  @IsNumber()
  driverTotal?: number;

  @IsOptional()
  @IsBoolean()
  driverWaitingIncluded?: boolean;

  @IsOptional()
  @IsBoolean()
  driverParkingIncluded?: boolean;

  @IsOptional()
  @IsBoolean()
  driverPayAsStandard?: boolean;

  @IsOptional()
  @IsBoolean()
  driverPriceOverride?: boolean;

  /* ---------------- PAYMENT ---------------- */

  @IsOptional()
  @IsString()
  paymentType?: string;

  /* ---------------- NOTES ---------------- */

  @IsOptional()
  @IsString()
  financeNote?: string;

  @IsOptional()
  @IsString()
  invoiceNote?: string;

  @IsOptional()
  @IsString()
  extraNote?: string;
}

/* =====================================================
   CREATE BOOKING
===================================================== */

export class CreateBookingDto {
  /* =====================================================
     COMPATIBILITY CUSTOMER FIELDS

     Keep required for now because existing Booking model,
     admin pages and dispatch already depend on them.

     New booking UI will populate these automatically from
     the primary passenger.
  ===================================================== */

  @IsString()
  customerName!: string;

  @IsString()
  customerPhone!: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  /* =====================================================
     ACCOUNT ALLOCATION
  ===================================================== */

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsString()
  costCenter?: string;

  @IsOptional()
  @IsString()
  invoiceRef?: string;

  @IsOptional()
  @IsString()
  jobStatus?: string;

  @IsOptional()
  @IsString()
  salesman?: string;

  @IsOptional()
  @IsString()
  nameCardOverride?: string;

  @IsOptional()
  @IsString()
  nameCardFileUrl?: string;

  /* =====================================================
     JOURNEY
  ===================================================== */

  @IsString()
  pickupAddress!: string;

  @IsString()
  dropoffAddress!: string;

  @IsDateString()
  pickupDatetime!: string;

  @IsOptional()
  @IsString()
  journeyType?: string;

  /* -----------------------------------------------------
     Existing compatibility passenger / luggage counts
  ----------------------------------------------------- */

  @IsOptional()
  @IsInt()
  @Min(0)
  passengers?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  luggage?: number;

  /* -----------------------------------------------------
     Detailed requirements from client
  ----------------------------------------------------- */

  @IsOptional()
  @IsInt()
  @Min(0)
  bigLuggage?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  smallLuggage?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  babySeats?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  childSeats?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  boosterSeats?: number;

  /* =====================================================
     NOTES
  ===================================================== */

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  driverNote?: string;

  /* =====================================================
     ROUTE / VEHICLE
  ===================================================== */

  @IsOptional()
  @IsString()
  preferredVehicleCategory?: string;

  @IsOptional()
  @IsString()
  requestedDriverType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  routeDistanceMeters?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  routeDurationSeconds?: number;

  /*
   * Keep this because the existing driver conflict engine
   * already uses it.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedDurationMinutes?: number;

  /* =====================================================
     OPTIONAL DRIVER ASSIGNMENT
  ===================================================== */

  @IsOptional()
  @IsUUID()
  assignedDriverId?: string;

  /* =====================================================
     BOOKERS
  ===================================================== */

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingBookerInputDto)
  bookers?: BookingBookerInputDto[];

  /* =====================================================
     PASSENGERS
  ===================================================== */

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingPassengerInputDto)
  passengersList?: BookingPassengerInputDto[];

  /* =====================================================
     VIA STOPS
  ===================================================== */

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingViaInputDto)
  vias?: BookingViaInputDto[];

  /* =====================================================
     FINANCE
  ===================================================== */

  @IsOptional()
  @ValidateNested()
  @Type(() => BookingFinanceInputDto)
  finance?: BookingFinanceInputDto;
}
