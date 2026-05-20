import { Module } from '@nestjs/common';

import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

import { WebsocketModule } from '../websocket/websocket.module';
import { DriversModule } from '../drivers/drivers.module';

@Module({
  imports: [WebsocketModule,DriversModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}