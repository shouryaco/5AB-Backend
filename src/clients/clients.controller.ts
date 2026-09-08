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

import { UserRole } from '@prisma/client';

import { ClientsService } from './clients.service';

import {
  CreateBookerDto,
  CreateClientAccountDto,
  CreatePassengerDto,
  UpdateBookerDto,
  UpdateClientAccountDto,
  UpdatePassengerDto,
} from './dto/clients.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.DISPATCHER)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  /* =====================================================
     ACCOUNTS
  ===================================================== */

  @Get('accounts')
  getAccounts(
    @Query('search') search?: string,
    @Query('active') active?: string,
  ) {
    return this.clientsService.getAccounts(search, active);
  }

  @Get('accounts/:id')
  getAccount(@Param('id') id: string) {
    return this.clientsService.getAccount(id);
  }

  @Post('accounts')
  createAccount(
    @Body()
    dto: CreateClientAccountDto,
  ) {
    return this.clientsService.createAccount(dto);
  }

  @Patch('accounts/:id')
  updateAccount(
    @Param('id') id: string,

    @Body()
    dto: UpdateClientAccountDto,
  ) {
    return this.clientsService.updateAccount(id, dto);
  }

  /* =====================================================
     BOOKERS
  ===================================================== */

  @Get('bookers')
  getBookers(
    @Query('accountId')
    accountId?: string,

    @Query('search')
    search?: string,
  ) {
    return this.clientsService.getBookers(accountId, search);
  }

  @Get('bookers/:id')
  getBooker(@Param('id') id: string) {
    return this.clientsService.getBooker(id);
  }

  @Post('bookers')
  createBooker(@Body() dto: CreateBookerDto) {
    return this.clientsService.createBooker(dto);
  }

  @Patch('bookers/:id')
  updateBooker(
    @Param('id') id: string,

    @Body() dto: UpdateBookerDto,
  ) {
    return this.clientsService.updateBooker(id, dto);
  }

  /* =====================================================
     PASSENGERS
  ===================================================== */

  @Get('passengers')
  getPassengers(
    @Query('accountId')
    accountId?: string,

    @Query('search')
    search?: string,
  ) {
    return this.clientsService.getPassengers(accountId, search);
  }

  @Get('passengers/:id')
  getPassenger(@Param('id') id: string) {
    return this.clientsService.getPassenger(id);
  }

  @Post('passengers')
  createPassenger(
    @Body()
    dto: CreatePassengerDto,
  ) {
    return this.clientsService.createPassenger(dto);
  }

  @Patch('passengers/:id')
  updatePassenger(
    @Param('id') id: string,

    @Body()
    dto: UpdatePassengerDto,
  ) {
    return this.clientsService.updatePassenger(id, dto);
  }
}
