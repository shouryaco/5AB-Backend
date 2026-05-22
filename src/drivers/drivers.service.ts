import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { DriverStatus } from '../common/enums/driver-status.enum';
import { BadRequestException } from '@nestjs/common';

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

  async getMyBookings(userId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: {
        userId,
      },
    });

    if (!driver) {
      throw new BadRequestException('Driver profile not found');
    }

    return this.prisma.booking.findMany({
      where: {
        assignedDriverId: driver.id,
      },

      include: {
        bookingStatusHistories: true,
      },

      orderBy: {
        pickupDatetime: 'asc',
      },
    });
  }
  async updateMyStatus(userId: string, status: DriverStatus) {
    const driver = await this.prisma.driver.findUnique({
      where: {
        userId,
      },
    });

    if (!driver) {
      throw new BadRequestException('Driver profile not found');
    }

    // Prevent manual BUSY setting
    if (status === DriverStatus.BUSY) {
      throw new BadRequestException('BUSY status is system controlled');
    }

    // Prevent manual INACTIVE setting
    if (status === DriverStatus.INACTIVE) {
      throw new BadRequestException('INACTIVE status is admin controlled');
    }

    return this.prisma.driver.update({
      where: {
        id: driver.id,
      },

      data: {
        status,
      },
    });
  }
}
