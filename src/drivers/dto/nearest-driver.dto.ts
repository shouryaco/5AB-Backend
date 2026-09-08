import { IsLatitude, IsLongitude } from 'class-validator';

export class NearestDriverDto {
  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;
}
