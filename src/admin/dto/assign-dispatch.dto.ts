import { IsString } from 'class-validator';

export class AssignDispatchDto {
  @IsString()
  bookingId!: string;

  @IsString()
  driverId!: string;
}
