import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';

import { AdminService } from './admin.service';
import { AssignDispatchDto } from './dto/assign-dispatch.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/dashboard')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /* =====================================================
     ADMIN OVERVIEW
  ===================================================== */

  @Get('overview')
  @Roles('ADMIN')
  getOverview() {
    return this.adminService.getOverview();
  }

  /* =====================================================
     DISPATCH BOARD
  ===================================================== */

  @Get('dispatch-board')
  @Roles('ADMIN', 'DISPATCHER')
  getDispatchBoard() {
    return this.adminService.getDispatchBoard();
  }

  /* =====================================================
     DISPATCH ASSIGNMENT
  ===================================================== */

  @Patch('dispatch/assign')
  @Roles('ADMIN', 'DISPATCHER')
  assignDriver(@Body() dto: AssignDispatchDto) {
    return this.adminService.assignDriverToBooking(dto.bookingId, dto.driverId);
  }
}
