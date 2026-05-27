import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { DriverStatus } from '../common/enums/driver-status.enum';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class DriversService {
  constructor(private prisma: PrismaService) {}

  calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;

    const dLat = ((lat2 - lat1) * Math.PI) / 180;

    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

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
  async updateLocation(userId: string, latitude: number, longitude: number) {
    const driver = await this.prisma.driver.findUnique({
      where: {
        userId,
      },
    });

    if (!driver) {
      throw new BadRequestException('Driver profile not found');
    }

    return this.prisma.driver.update({
      where: {
        id: driver.id,
      },

      data: {
        latitude,
        longitude,
        lastLocationUpdate: new Date(),
      },
    });
  }
  async findNearestDrivers(latitude: number, longitude: number) {
    const drivers = await this.prisma.driver.findMany({
      where: {
        status: DriverStatus.AVAILABLE,

        latitude: {
          not: null,
        },

        longitude: {
          not: null,
        },
      },
    });

    const driversWithDistance = drivers.map((driver) => {
      const distanceKm = this.calculateDistanceKm(
        latitude,
        longitude,
        driver.latitude!,
        driver.longitude!,
      );

      return {
        ...driver,
        distanceKm: Number(distanceKm.toFixed(2)),
      };
    });

    return driversWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);
  }
}
