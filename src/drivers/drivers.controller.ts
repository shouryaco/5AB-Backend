import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { Patch, Param } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { RolesGuard } from '../auth/roles.guard';

import { Roles } from '../auth/roles.decorator';

import { UpdateMyStatusDto } from './dto/update-my-status.dto';

import { UpdateLocationDto } from './dto/update-location.dto';
import { Query } from '@nestjs/common';

import { NearestDriverDto } from './dto/nearest-driver.dto';

@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  create(@Body() createDriverDto: CreateDriverDto) {
    return this.driversService.create(createDriverDto);
  }

  @Get()
  findAll() {
    return this.driversService.findAll();
  }
  @Patch(':id/online')
  setDriverOnline(@Param('id') id: string) {
    return this.driversService.setDriverOnline(id);
  }

  @Patch(':id/offline')
  setDriverOffline(@Param('id') id: string) {
    return this.driversService.setDriverOffline(id);
  }
  @Patch(':id/inactive')
  setDriverInactive(@Param('id') id: string) {
    return this.driversService.setDriverInactive(id);
  }

  @Get('my-bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  getMyBookings(@Req() req) {
    return this.driversService.getMyBookings(req.user.sub);
  }
  @Patch('my-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  updateMyStatus(
    @Req() req,
    @Body()
    updateMyStatusDto: UpdateMyStatusDto,
  ) {
    return this.driversService.updateMyStatus(
      req.user.sub,
      updateMyStatusDto.status,
    );
  }
  @Patch('location')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  updateLocation(
    @Req() req,

    @Body()
    updateLocationDto: UpdateLocationDto,
  ) {
    return this.driversService.updateLocation(
      req.user.sub,
      updateLocationDto.latitude,
      updateLocationDto.longitude,
    );
  }
  @Get('nearest')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  findNearestDrivers(
    @Query()
    nearestDriverDto: NearestDriverDto,
  ) {
    return this.driversService.findNearestDrivers(
      Number(nearestDriverDto.latitude),
      Number(nearestDriverDto.longitude),
    );
  }
}
