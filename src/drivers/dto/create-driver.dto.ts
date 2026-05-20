import { IsOptional, IsString } from 'class-validator';

export class CreateDriverDto {
  @IsString()
  name: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  photo?: string;

  @IsOptional()
  @IsString()
  vehicleName?: string;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;
}