import { Controller, Get, Body, Patch } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AssignDispatchDto } from './dto/assign-dispatch.dto';
import { UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { RolesGuard } from '../auth/roles.guard';

import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/dashboard')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('overview')
  getOverview() {
    return this.adminService.getOverview();
  }
  @Get('dispatch-board')
  getDispatchBoard() {
    return this.adminService.getDispatchBoard();
  }
  @Patch('dispatch/assign')
  assignDriver(@Body() dto: AssignDispatchDto) {
    return this.adminService.assignDriverToBooking(dto.bookingId, dto.driverId);
  }
}
