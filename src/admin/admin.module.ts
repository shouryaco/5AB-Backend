import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [WebsocketModule, BookingsModule],
  controllers: [AdminController],
  providers: [AdminService, PrismaService],
})
export class AdminModule {}
