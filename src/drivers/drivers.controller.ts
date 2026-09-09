import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { DriversService } from './drivers.service';

import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { UpdateMyStatusDto } from './dto/update-my-status.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { NearestDriverDto } from './dto/nearest-driver.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

import { CreateDriverDocumentDto } from './dto/create-driver-document.dto';
import { UpdateDriverDocumentDto } from './dto/update-driver-document.dto';

import { CreateVehicleDocumentDto } from './dto/create-vehicle-document.dto';
import { UpdateVehicleDocumentDto } from './dto/update-vehicle-document.dto';

@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  /*
   * ADMIN - CREATE DRIVER
   */

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() createDriverDto: CreateDriverDto) {
    return this.driversService.create(createDriverDto);
  }

  /*
   * ADMIN / DISPATCHER - DRIVER LIST
   */

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  findAll() {
    return this.driversService.findAll();
  }

  /*
   * DRIVER APP - MY BOOKINGS
   */

  @Get('my-bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  getMyBookings(@Req() req) {
    return this.driversService.getMyBookings(req.user.sub);
  }

  /*
   * DRIVER APP - MY STATUS
   */

  @Patch('my-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  updateMyStatus(@Req() req, @Body() updateMyStatusDto: UpdateMyStatusDto) {
    return this.driversService.updateMyStatus(
      req.user.sub,
      updateMyStatusDto.status,
    );
  }

  /*
   * DRIVER APP - LOCATION
   */

  @Patch('location')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  updateLocation(@Req() req, @Body() updateLocationDto: UpdateLocationDto) {
    return this.driversService.updateLocation(
      req.user.sub,
      updateLocationDto.latitude,
      updateLocationDto.longitude,
    );
  }

  /*
   * ADMIN / DISPATCHER - NEAREST DRIVER
   */

  @Get('nearest')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  findNearestDrivers(@Query() nearestDriverDto: NearestDriverDto) {
    return this.driversService.findNearestDrivers(
      Number(nearestDriverDto.latitude),
      Number(nearestDriverDto.longitude),
    );
  }

  /*
   * ADMIN / DISPATCHER - LIVE MAP
   */

  @Get('live')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  getLiveDrivers() {
    return this.driversService.getLiveDrivers();
  }

  /*
   * ADMIN / DISPATCHER - OPERATIONAL STATUS CONTROLS
   *
   * The service prevents DISPATCHER from reactivating an
   * INACTIVE driver and prevents manual AVAILABLE/OFFLINE
   * changes while a driver is BUSY on an active trip.
   */

  @Patch(':id/online')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  setDriverOnline(@Param('id') id: string, @Req() req) {
    return this.driversService.setDriverOnline(id, req.user.role);
  }

  @Patch(':id/offline')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  setDriverOffline(@Param('id') id: string, @Req() req) {
    return this.driversService.setDriverOffline(id, req.user.role);
  }

  /*
   * ADMIN ONLY - COMPLIANCE STATUS
   */

  @Patch(':id/inactive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  setDriverInactive(@Param('id') id: string) {
    return this.driversService.setDriverInactive(id);
  }

  /*
   * ADMIN ONLY - FULL DRIVER PROFILE
   *
   * Full profile contains private/admin-only driver data.
   * Dispatchers already have safe operational driver data
   * through /drivers, /drivers/live and the dispatch board.
   */

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  findOne(@Param('id') id: string) {
    return this.driversService.findOne(id);
  }

  /*
   * VEHICLE MANAGEMENT
   *
   * Full vehicle records include document/compliance data,
   * so these management endpoints are ADMIN only.
   */

  @Get(':id/vehicles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getDriverVehicles(@Param('id') id: string) {
    return this.driversService.getDriverVehicles(id);
  }

  @Post(':id/vehicles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  createVehicle(
    @Param('id') id: string,
    @Body() createVehicleDto: CreateVehicleDto,
  ) {
    return this.driversService.createVehicle(id, createVehicleDto);
  }

  @Patch(':driverId/vehicles/:vehicleId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updateVehicle(
    @Param('driverId') driverId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() updateVehicleDto: UpdateVehicleDto,
  ) {
    return this.driversService.updateVehicle(
      driverId,
      vehicleId,
      updateVehicleDto,
    );
  }

  @Delete(':driverId/vehicles/:vehicleId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  deleteVehicle(
    @Param('driverId') driverId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.driversService.deleteVehicle(driverId, vehicleId);
  }

  /*
   * DRIVER DOCUMENTS - ADMIN ONLY
   */

  @Get(':id/documents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getDriverDocuments(@Param('id') driverId: string) {
    return this.driversService.getDriverDocuments(driverId);
  }

  @Post(':id/documents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  createDriverDocument(
    @Param('id') driverId: string,
    @Body() dto: CreateDriverDocumentDto,
  ) {
    return this.driversService.createDriverDocument(driverId, dto);
  }

  @Patch(':driverId/documents/:documentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updateDriverDocument(
    @Param('driverId') driverId: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateDriverDocumentDto,
  ) {
    return this.driversService.updateDriverDocument(driverId, documentId, dto);
  }

  @Delete(':driverId/documents/:documentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  deleteDriverDocument(
    @Param('driverId') driverId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.driversService.deleteDriverDocument(driverId, documentId);
  }

  /*
   * VEHICLE DOCUMENTS - ADMIN ONLY
   */

  @Get(':driverId/vehicles/:vehicleId/documents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getVehicleDocuments(
    @Param('driverId') driverId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.driversService.getVehicleDocuments(driverId, vehicleId);
  }

  @Post(':driverId/vehicles/:vehicleId/documents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  createVehicleDocument(
    @Param('driverId') driverId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: CreateVehicleDocumentDto,
  ) {
    return this.driversService.createVehicleDocument(driverId, vehicleId, dto);
  }

  @Patch(':driverId/vehicles/:vehicleId/documents/:documentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updateVehicleDocument(
    @Param('driverId') driverId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateVehicleDocumentDto,
  ) {
    return this.driversService.updateVehicleDocument(
      driverId,
      vehicleId,
      documentId,
      dto,
    );
  }

  @Delete(':driverId/vehicles/:vehicleId/documents/:documentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  deleteVehicleDocument(
    @Param('driverId') driverId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.driversService.deleteVehicleDocument(
      driverId,
      vehicleId,
      documentId,
    );
  }

  /*
   * UPDATE DRIVER - ADMIN ONLY
   */

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() updateDriverDto: UpdateDriverDto) {
    return this.driversService.update(id, updateDriverDto);
  }
}
