import { Controller, Get, Body, Patch } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AssignDispatchDto } from './dto/assign-dispatch.dto';

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
