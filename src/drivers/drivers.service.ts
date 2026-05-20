import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { DriverStatus } from '../common/enums/driver-status.enum';

@Injectable()
export class DriversService {
  constructor(private prisma: PrismaService) {}

  async create(createDriverDto: CreateDriverDto) {
    return this.prisma.driver.create({
      data: createDriverDto,
    });
  }

  async findAll() {
    return this.prisma.driver.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async updateDriverStatus(driverId: string, status: DriverStatus) {
    return this.prisma.driver.update({
      where: {
        id: driverId,
      },
      data: {
        status,
      },
    });
  }
  async setDriverOnline(driverId: string) {
    return this.updateDriverStatus(driverId, DriverStatus.AVAILABLE);
  }

  async setDriverOffline(driverId: string) {
    return this.updateDriverStatus(driverId, DriverStatus.OFFLINE);
  }
  async setDriverInactive(driverId: string) {
    return this.updateDriverStatus(driverId, DriverStatus.INACTIVE);
  }
}
