import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { BookingsModule } from './bookings/bookings.module';
import { DriversModule } from './drivers/drivers.module';
import { WebsocketModule } from './websocket/websocket.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    PrismaModule,
    BookingsModule,
    DriversModule,
    WebsocketModule,
    AdminModule,
  ],
})
export class AppModule {}
