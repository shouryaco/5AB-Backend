import { Body, Controller, Get, Post } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { Patch, Param } from '@nestjs/common';

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
}
