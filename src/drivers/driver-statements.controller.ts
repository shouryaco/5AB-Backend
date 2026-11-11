import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards, 
} from '@nestjs/common';

import { DriverStatementsService } from './driver-statements.service';
import { CreateDriverStatementDto } from './dto/create-driver-statement.dto';
import { MarkDriverStatementPaidDto } from './dto/mark-driver-statement-paid.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('drivers/:driverId/statements')
export class DriverStatementsController {
  constructor(
    private readonly driverStatementsService: DriverStatementsService,
  ) {}

  @Get('preview')
  preview(
    @Param('driverId') driverId: string,
    @Query('month') month: string,
  ) {
    return this.driverStatementsService.preview(driverId, month);
  }

  @Get()
  list(
    @Param('driverId') driverId: string,
    @Query('month') month?: string,
    @Query('search') search?: string,
  ) {
    return this.driverStatementsService.list(driverId, month, search);
  }

  @Post()
  create(
    @Param('driverId') driverId: string,
    @Body() dto: CreateDriverStatementDto,
  ) {
    return this.driverStatementsService.createStatement(
      driverId,
      dto.month,
      dto.notes,
    );
  }

  @Get(':statementId')
  findOne(
    @Param('driverId') driverId: string,
    @Param('statementId') statementId: string,
  ) {
    return this.driverStatementsService.findOne(driverId, statementId);
  }

  @Patch(':statementId/paid')
  markPaid(
    @Param('driverId') driverId: string,
    @Param('statementId') statementId: string,
    @Body() dto: MarkDriverStatementPaidDto,
  ) {
    return this.driverStatementsService.markPaid(
      driverId,
      statementId,
      dto.paidAt,
    );
  }

  @Patch(':statementId/unpaid')
  markUnpaid(
    @Param('driverId') driverId: string,
    @Param('statementId') statementId: string,
  ) {
    return this.driverStatementsService.markUnpaid(
      driverId,
      statementId,
    );
  }
}
