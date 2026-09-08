import { PartialType } from '@nestjs/mapped-types';
import { CreateVehicleDocumentDto } from './create-vehicle-document.dto';

export class UpdateVehicleDocumentDto extends PartialType(
  CreateVehicleDocumentDto,
) {}
