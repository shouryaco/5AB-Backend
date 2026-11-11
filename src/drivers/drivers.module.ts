import { Module } from '@nestjs/common';

import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { DriverStatementsController } from './driver-statements.controller';
import { DriverStatementsService } from './driver-statements.service';

@Module({
  controllers: [DriversController,
    DriverStatementsController,],
  providers: [DriversService, DriverStatementsService,],
  exports: [DriversService],
})
export class DriversModule {}