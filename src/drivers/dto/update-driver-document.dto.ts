import { PartialType } from '@nestjs/mapped-types';
import { CreateDriverDocumentDto } from './create-driver-document.dto';

export class UpdateDriverDocumentDto extends PartialType(
  CreateDriverDocumentDto,
) {}
