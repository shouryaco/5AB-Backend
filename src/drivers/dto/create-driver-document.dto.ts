import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

import { DocumentStatus } from '@prisma/client';

export class CreateDriverDocumentDto {
  @IsString()
  documentType!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  postCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
