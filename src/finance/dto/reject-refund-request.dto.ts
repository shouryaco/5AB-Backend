import {
  IsOptional,
  IsString,
} from 'class-validator';

export class RejectRefundRequestDto {
  @IsOptional()
  @IsString()
  adminNote?: string;
}
