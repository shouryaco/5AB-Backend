import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, UserRole } from '@prisma/client';

import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';

import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';

import { DriverStatus } from '../common/enums/driver-status.enum';

import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

import { CreateDriverDocumentDto } from './dto/create-driver-document.dto';
import { UpdateDriverDocumentDto } from './dto/update-driver-document.dto';

import { CreateVehicleDocumentDto } from './dto/create-vehicle-document.dto';
import { UpdateVehicleDocumentDto } from './dto/update-vehicle-document.dto';

@Injectable()
export class DriversService {
  constructor(private prisma: PrismaService) {}

  /*
   * =====================================================
   * DISTANCE
   * =====================================================
   */

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

  private validateCoordinates(latitude: number, longitude: number) {
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException('Invalid latitude or longitude');
    }
  }

  private async getDriverStatusRecord(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: {
        id: driverId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    return driver;
  }

  private async getDriverForApp(userId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
        status: true,
        appAccessEnabled: true,
      },
    });

    if (!driver) {
      throw new BadRequestException('Driver profile not found');
    }

    if (!driver.appAccessEnabled) {
      throw new BadRequestException('Driver app access is disabled');
    }

    return driver;
  }

  /*
   * =====================================================
   * CREATE DRIVER
   * =====================================================
   */

  async create(createDriverDto: CreateDriverDto) {
    const firstName = createDriverDto.firstName?.trim();

    const lastName = createDriverDto.lastName?.trim();

    const legacyName = createDriverDto.name?.trim();

    /*
     * Support old frontend while requiring
     * proper name data from the new frontend.
     */
    if (!legacyName && (!firstName || !lastName)) {
      throw new BadRequestException('First name and last name are required');
    }

    const fullName =
      firstName && lastName ? `${firstName} ${lastName}` : legacyName!;

    if (createDriverDto.password && !createDriverDto.email) {
      throw new BadRequestException(
        'Email is required when creating driver login access',
      );
    }

    if (createDriverDto.callSign) {
      const existingCallSign = await this.prisma.driver.findUnique({
        where: {
          callSign: createDriverDto.callSign,
        },
      });

      if (existingCallSign) {
        throw new BadRequestException(
          'This driver ID / call sign is already in use',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let userId: string | null = null;

      /*
       * Create DRIVER user account only when
       * email + password are supplied.
       */
      if (createDriverDto.email && createDriverDto.password) {
        const existingUser = await tx.user.findUnique({
          where: {
            email: createDriverDto.email,
          },
        });

        if (existingUser) {
          throw new BadRequestException(
            'A user with this email already exists',
          );
        }

        const hashedPassword = await bcrypt.hash(createDriverDto.password, 10);

        const user = await tx.user.create({
          data: {
            name: fullName,

            email: createDriverDto.email,

            password: hashedPassword,

            role: UserRole.DRIVER,
          },
        });

        userId = user.id;
      }

      const {
        password,
        name,
        dateOfBirth,
        companyJoiningDate,
        activeDate,
        ...rest
      } = createDriverDto;

      return tx.driver.create({
        data: {
          ...rest,

          name: fullName,

          firstName: firstName || null,

          lastName: lastName || null,

          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,

          companyJoiningDate: companyJoiningDate
            ? new Date(companyJoiningDate)
            : undefined,

          activeDate: activeDate ? new Date(activeDate) : undefined,

          userId,

          appAccessEnabled: Boolean(userId),
        },

        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              lastLoginAt: true,
              createdAt: true,
            },
          },
        },
      });
    });
  }

  /*
   * =====================================================
   * DRIVER LIST
   * =====================================================
   */

  async findAll() {
    return this.prisma.driver.findMany({
      select: {
        id: true,

        name: true,
        firstName: true,
        lastName: true,

        driverType: true,
        callSign: true,

        phone: true,
        email: true,

        photo: true,

        driverGrade: true,
        accountStatus: true,

        vehicleName: true,
        vehicleNumber: true,

        status: true,

        latitude: true,
        longitude: true,
        lastLocationUpdate: true,

        appAccessEnabled: true,

        userId: true,

        createdAt: true,
        updatedAt: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async createVehicle(driverId: string, createVehicleDto: CreateVehicleDto) {
    const driver = await this.prisma.driver.findUnique({
      where: {
        id: driverId,
      },

      include: {
        vehicles: true,
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const { purchaseDate, companyJoiningDate, isPrimary, ...rest } =
      createVehicleDto;

    /*
     * First vehicle automatically becomes primary.
     */
    const makePrimary = isPrimary === true || driver.vehicles.length === 0;

    return this.prisma.$transaction(async (tx) => {
      if (makePrimary) {
        await tx.vehicle.updateMany({
          where: {
            driverId,
          },

          data: {
            isPrimary: false,
          },
        });
      }

      const vehicle = await tx.vehicle.create({
        data: {
          ...rest,

          driverId,

          isPrimary: makePrimary,

          purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,

          companyJoiningDate: companyJoiningDate
            ? new Date(companyJoiningDate)
            : undefined,
        },

        include: {
          documents: true,
        },
      });

      /*
       * Keep old fields synchronized because
       * Dispatch / Map / Bookings still use them.
       */
      if (makePrimary) {
        await tx.driver.update({
          where: {
            id: driverId,
          },

          data: {
            vehicleName: vehicle.vehicleType,

            vehicleNumber: vehicle.registrationNumber,
          },
        });
      }

      return vehicle;
    });
  }

  async updateVehicle(
    driverId: string,
    vehicleId: string,
    updateVehicleDto: UpdateVehicleDto,
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        driverId,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const { purchaseDate, companyJoiningDate, isPrimary, ...rest } =
      updateVehicleDto;

    return this.prisma.$transaction(async (tx) => {
      let replacementVehicle: {
        id: string;
        vehicleType: string;
        registrationNumber: string;
      } | null = null;

      /*
       * A driver with vehicles should always have one primary vehicle.
       * If the current primary vehicle is explicitly unset, promote
       * another vehicle in the same transaction.
       */
      if (isPrimary === false && vehicle.isPrimary) {
        replacementVehicle = await tx.vehicle.findFirst({
          where: {
            driverId,
            id: {
              not: vehicleId,
            },
          },
          orderBy: [
            {
              status: 'asc',
            },
            {
              createdAt: 'desc',
            },
          ],
          select: {
            id: true,
            vehicleType: true,
            registrationNumber: true,
          },
        });

        if (!replacementVehicle) {
          throw new BadRequestException(
            'The only vehicle cannot be removed as primary',
          );
        }
      }

      if (isPrimary === true) {
        await tx.vehicle.updateMany({
          where: {
            driverId,
            id: {
              not: vehicleId,
            },
          },

          data: {
            isPrimary: false,
          },
        });
      }

      const updatedVehicle = await tx.vehicle.update({
        where: {
          id: vehicleId,
        },

        data: {
          ...rest,

          ...(isPrimary !== undefined && {
            isPrimary,
          }),

          ...(purchaseDate !== undefined && {
            purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
          }),

          ...(companyJoiningDate !== undefined && {
            companyJoiningDate: companyJoiningDate
              ? new Date(companyJoiningDate)
              : null,
          }),
        },

        include: {
          documents: true,
        },
      });

      if (replacementVehicle) {
        await tx.vehicle.update({
          where: {
            id: replacementVehicle.id,
          },
          data: {
            isPrimary: true,
          },
        });

        await tx.driver.update({
          where: {
            id: driverId,
          },
          data: {
            vehicleName: replacementVehicle.vehicleType,
            vehicleNumber: replacementVehicle.registrationNumber,
          },
        });

        return updatedVehicle;
      }

      /*
       * Keep compatibility fields synchronized whenever the updated
       * vehicle remains/becomes primary.
       */
      if (updatedVehicle.isPrimary) {
        await tx.driver.update({
          where: {
            id: driverId,
          },

          data: {
            vehicleName: updatedVehicle.vehicleType,

            vehicleNumber: updatedVehicle.registrationNumber,
          },
        });
      }

      return updatedVehicle;
    });
  }

  async deleteVehicle(driverId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        driverId,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.vehicle.delete({
        where: {
          id: vehicleId,
        },
      });

      /*
       * If deleted vehicle was primary,
       * choose another vehicle automatically.
       */
      if (vehicle.isPrimary) {
        const replacement = await tx.vehicle.findFirst({
          where: {
            driverId,
          },

          orderBy: [
            {
              status: 'asc',
            },
            {
              createdAt: 'desc',
            },
          ],
        });

        if (replacement) {
          await tx.vehicle.update({
            where: {
              id: replacement.id,
            },

            data: {
              isPrimary: true,
            },
          });

          await tx.driver.update({
            where: {
              id: driverId,
            },

            data: {
              vehicleName: replacement.vehicleType,

              vehicleNumber: replacement.registrationNumber,
            },
          });
        } else {
          await tx.driver.update({
            where: {
              id: driverId,
            },

            data: {
              vehicleName: null,
              vehicleNumber: null,
            },
          });
        }
      }

      return {
        success: true,
        message: 'Vehicle deleted',
      };
    });
  }

  async getDriverVehicles(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: {
        id: driverId,
      },

      select: {
        id: true,
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    return this.prisma.vehicle.findMany({
      where: {
        driverId,
      },

      include: {
        documents: true,
      },

      orderBy: [
        {
          isPrimary: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  async getDriverDocuments(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: {
        id: driverId,
      },
      select: {
        id: true,
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    return this.prisma.driverDocument.findMany({
      where: {
        driverId,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async createDriverDocument(driverId: string, dto: CreateDriverDocumentDto) {
    const driver = await this.prisma.driver.findUnique({
      where: {
        id: driverId,
      },
      select: {
        id: true,
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const { issueDate, startDate, expiryDate, ...rest } = dto;

    return this.prisma.driverDocument.create({
      data: {
        ...rest,

        driverId,

        issueDate: issueDate ? new Date(issueDate) : undefined,

        startDate: startDate ? new Date(startDate) : undefined,

        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      },
    });
  }

  async updateDriverDocument(
    driverId: string,
    documentId: string,
    dto: UpdateDriverDocumentDto,
  ) {
    const document = await this.prisma.driverDocument.findFirst({
      where: {
        id: documentId,
        driverId,
      },
    });

    if (!document) {
      throw new NotFoundException('Driver document not found');
    }

    const { issueDate, startDate, expiryDate, ...rest } = dto;

    return this.prisma.driverDocument.update({
      where: {
        id: documentId,
      },

      data: {
        ...rest,

        ...(issueDate !== undefined && {
          issueDate: issueDate ? new Date(issueDate) : null,
        }),

        ...(startDate !== undefined && {
          startDate: startDate ? new Date(startDate) : null,
        }),

        ...(expiryDate !== undefined && {
          expiryDate: expiryDate ? new Date(expiryDate) : null,
        }),
      },
    });
  }

  async deleteDriverDocument(driverId: string, documentId: string) {
    const document = await this.prisma.driverDocument.findFirst({
      where: {
        id: documentId,
        driverId,
      },
    });

    if (!document) {
      throw new NotFoundException('Driver document not found');
    }

    await this.prisma.driverDocument.delete({
      where: {
        id: documentId,
      },
    });

    return {
      success: true,
      message: 'Driver document deleted',
    };
  }

  async getVehicleDocuments(driverId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        driverId,
      },

      select: {
        id: true,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    return this.prisma.vehicleDocument.findMany({
      where: {
        vehicleId,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async createVehicleDocument(
    driverId: string,
    vehicleId: string,
    dto: CreateVehicleDocumentDto,
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        driverId,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const { issueDate, startDate, expiryDate, ...rest } = dto;

    return this.prisma.vehicleDocument.create({
      data: {
        ...rest,

        vehicleId,

        issueDate: issueDate ? new Date(issueDate) : undefined,

        startDate: startDate ? new Date(startDate) : undefined,

        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      },
    });
  }

  async updateVehicleDocument(
    driverId: string,
    vehicleId: string,
    documentId: string,
    dto: UpdateVehicleDocumentDto,
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        driverId,
      },

      select: {
        id: true,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const document = await this.prisma.vehicleDocument.findFirst({
      where: {
        id: documentId,
        vehicleId,
      },
    });

    if (!document) {
      throw new NotFoundException('Vehicle document not found');
    }

    const { issueDate, startDate, expiryDate, ...rest } = dto;

    return this.prisma.vehicleDocument.update({
      where: {
        id: documentId,
      },

      data: {
        ...rest,

        ...(issueDate !== undefined && {
          issueDate: issueDate ? new Date(issueDate) : null,
        }),

        ...(startDate !== undefined && {
          startDate: startDate ? new Date(startDate) : null,
        }),

        ...(expiryDate !== undefined && {
          expiryDate: expiryDate ? new Date(expiryDate) : null,
        }),
      },
    });
  }

  async deleteVehicleDocument(
    driverId: string,
    vehicleId: string,
    documentId: string,
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        driverId,
      },

      select: {
        id: true,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const document = await this.prisma.vehicleDocument.findFirst({
      where: {
        id: documentId,
        vehicleId,
      },
    });

    if (!document) {
      throw new NotFoundException('Vehicle document not found');
    }

    await this.prisma.vehicleDocument.delete({
      where: {
        id: documentId,
      },
    });

    return {
      success: true,
      message: 'Vehicle document deleted',
    };
  }

  /*
   * =====================================================
   * FULL DRIVER PROFILE
   * =====================================================
   */

  async findOne(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: {
        id: driverId,
      },

      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },

        documents: {
          orderBy: {
            createdAt: 'desc',
          },
        },

        vehicles: {
          include: {
            documents: {
              orderBy: {
                createdAt: 'desc',
              },
            },
          },

          orderBy: [
            {
              isPrimary: 'desc',
            },
            {
              createdAt: 'desc',
            },
          ],
        },

        bookings: {
          take: 20,

          orderBy: {
            pickupDatetime: 'desc',
          },

          include: {
            bookingStatusHistories: {
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const lastCompletedBooking = await this.prisma.booking.findFirst({
      where: {
        assignedDriverId: driverId,

        status: 'COMPLETED',
      },

      orderBy: {
        pickupDatetime: 'desc',
      },

      select: {
        pickupDatetime: true,
      },
    });

    return {
      ...driver,

      lastJobDate: lastCompletedBooking?.pickupDatetime ?? null,
    };
  }

  /*
   * =====================================================
   * UPDATE DRIVER
   * =====================================================
   */

  async update(driverId: string, updateDriverDto: UpdateDriverDto) {
    const currentDriver = await this.prisma.driver.findUnique({
      where: {
        id: driverId,
      },

      include: {
        user: true,
      },
    });

    if (!currentDriver) {
      throw new NotFoundException('Driver not found');
    }

    if (
      updateDriverDto.callSign &&
      updateDriverDto.callSign !== currentDriver.callSign
    ) {
      const existingCallSign = await this.prisma.driver.findUnique({
        where: {
          callSign: updateDriverDto.callSign,
        },
      });

      if (existingCallSign) {
        throw new BadRequestException(
          'This driver ID / call sign is already in use',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let userId = currentDriver.userId;

      /*
       * Existing login account.
       *
       * Allow email/password update.
       */
      if (currentDriver.user) {
        const userUpdate: {
          name?: string;
          email?: string;
          password?: string;
        } = {};

        if (
          updateDriverDto.email &&
          updateDriverDto.email !== currentDriver.user.email
        ) {
          const existingUser = await tx.user.findUnique({
            where: {
              email: updateDriverDto.email,
            },
            select: {
              id: true,
            },
          });

          if (existingUser && existingUser.id !== currentDriver.user.id) {
            throw new BadRequestException(
              'A user with this email already exists',
            );
          }

          userUpdate.email = updateDriverDto.email;
        }

        if (updateDriverDto.password) {
          userUpdate.password = await bcrypt.hash(updateDriverDto.password, 10);
        }

        if (Object.keys(userUpdate).length) {
          await tx.user.update({
            where: {
              id: currentDriver.user.id,
            },

            data: userUpdate,
          });
        }
      }

      /*
       * No login exists yet.
       *
       * Supplying a password creates the
       * DRIVER User and links it.
       */
      if (!currentDriver.user && updateDriverDto.password) {
        const accountEmail = updateDriverDto.email || currentDriver.email;

        if (!accountEmail) {
          throw new BadRequestException(
            'Email is required before creating driver login access',
          );
        }

        const existingUser = await tx.user.findUnique({
          where: {
            email: accountEmail,
          },
        });

        if (existingUser) {
          throw new BadRequestException(
            'A user with this email already exists',
          );
        }

        const hashedPassword = await bcrypt.hash(updateDriverDto.password, 10);

        const accountName = this.buildUpdatedName(
          currentDriver,
          updateDriverDto,
        );

        const newUser = await tx.user.create({
          data: {
            name: accountName,
            email: accountEmail,
            password: hashedPassword,
            role: UserRole.DRIVER,
          },
        });

        userId = newUser.id;
      }

      const {
        password,
        name,
        firstName,
        lastName,
        dateOfBirth,
        companyJoiningDate,
        activeDate,
        ...rest
      } = updateDriverDto;

      const updatedName = this.buildUpdatedName(currentDriver, updateDriverDto);

      const data: Prisma.DriverUncheckedUpdateInput = {
        ...rest,

        name: updatedName,

        ...(firstName !== undefined && {
          firstName: firstName.trim(),
        }),

        ...(lastName !== undefined && {
          lastName: lastName.trim(),
        }),

        ...(dateOfBirth !== undefined && {
          dateOfBirth: new Date(dateOfBirth),
        }),

        ...(companyJoiningDate !== undefined && {
          companyJoiningDate: new Date(companyJoiningDate),
        }),

        ...(activeDate !== undefined && {
          activeDate: new Date(activeDate),
        }),

        ...(userId && {
          userId,
          appAccessEnabled: true,
        }),
      };

      /*
       * Keep User.name synchronized.
       */
      if (currentDriver.user || userId) {
        await tx.user.update({
          where: {
            id: userId!,
          },

          data: {
            name: updatedName,
          },
        });
      }

      return tx.driver.update({
        where: {
          id: driverId,
        },

        data,

        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              lastLoginAt: true,
              createdAt: true,
            },
          },

          documents: true,

          vehicles: {
            include: {
              documents: true,
            },
          },
        },
      });
    });
  }

  private buildUpdatedName(
    currentDriver: {
      name: string;
      firstName: string | null;
      lastName: string | null;
    },

    updateDriverDto: UpdateDriverDto,
  ) {
    /*
     * Explicit old-style name update.
     */
    if (
      updateDriverDto.name &&
      updateDriverDto.firstName === undefined &&
      updateDriverDto.lastName === undefined
    ) {
      return updateDriverDto.name.trim();
    }

    const firstName =
      updateDriverDto.firstName !== undefined
        ? updateDriverDto.firstName.trim()
        : currentDriver.firstName;

    const lastName =
      updateDriverDto.lastName !== undefined
        ? updateDriverDto.lastName.trim()
        : currentDriver.lastName;

    const generatedName = [firstName, lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return generatedName || updateDriverDto.name?.trim() || currentDriver.name;
  }

  /*
   * =====================================================
   * ADMIN STATUS
   * =====================================================
   */

  async updateDriverStatus(driverId: string, status: DriverStatus) {
    await this.getDriverStatusRecord(driverId);

    return this.prisma.driver.update({
      where: {
        id: driverId,
      },

      data: {
        status,
      },
    });
  }

  async setDriverOnline(driverId: string, requesterRole?: string) {
    const driver = await this.getDriverStatusRecord(driverId);

    if (driver.status === DriverStatus.BUSY) {
      throw new BadRequestException(
        'A busy driver cannot be manually marked available',
      );
    }

    if (
      driver.status === DriverStatus.INACTIVE &&
      requesterRole !== UserRole.ADMIN
    ) {
      throw new BadRequestException(
        'Inactive drivers can only be reactivated by an admin',
      );
    }

    return this.prisma.driver.update({
      where: {
        id: driverId,
      },
      data: {
        status: DriverStatus.AVAILABLE,
      },
    });
  }

  async setDriverOffline(driverId: string, requesterRole?: string) {
    const driver = await this.getDriverStatusRecord(driverId);

    if (driver.status === DriverStatus.BUSY) {
      throw new BadRequestException(
        'A busy driver cannot be manually marked offline',
      );
    }

    if (
      driver.status === DriverStatus.INACTIVE &&
      requesterRole !== UserRole.ADMIN
    ) {
      throw new BadRequestException(
        'Inactive drivers can only be changed by an admin',
      );
    }

    return this.prisma.driver.update({
      where: {
        id: driverId,
      },
      data: {
        status: DriverStatus.OFFLINE,
      },
    });
  }

  async setDriverInactive(driverId: string) {
    const driver = await this.getDriverStatusRecord(driverId);

    if (driver.status === DriverStatus.BUSY) {
      throw new BadRequestException(
        'A busy driver cannot be made inactive until the active trip is finished',
      );
    }

    return this.prisma.driver.update({
      where: {
        id: driverId,
      },
      data: {
        status: DriverStatus.INACTIVE,
      },
    });
  }

  /*
   * =====================================================
   * DRIVER APP - BOOKINGS
   * =====================================================
   */

  async getMyBookings(userId: string) {
    const driver = await this.getDriverForApp(userId);

    return this.prisma.booking.findMany({
      where: {
        assignedDriverId: driver.id,
      },

      select: {
        id: true,
        bookingReference: true,

        customerName: true,
        customerPhone: true,

        pickupAddress: true,
        dropoffAddress: true,
        pickupDatetime: true,

        journeyType: true,

        passengers: true,
        luggage: true,
        bigLuggage: true,
        smallLuggage: true,
        babySeats: true,
        childSeats: true,
        boosterSeats: true,

        driverNote: true,

        preferredVehicleCategory: true,

        routeDistanceMeters: true,
        routeDurationSeconds: true,
        estimatedDurationMinutes: true,

        status: true,

        acceptedAt: true,
        arrivedAt: true,
        startedAt: true,
        completedAt: true,
        cancelledAt: true,
        rejectedAt: true,

        vias: {
          orderBy: {
            position: 'asc',
          },
          select: {
            id: true,
            address: true,
            position: true,
            latitude: true,
            longitude: true,
          },
        },

        bookingStatusHistories: {
          orderBy: {
            createdAt: 'asc',
          },
          select: {
            id: true,
            status: true,
            notes: true,
            createdAt: true,
          },
        },
      },

      orderBy: {
        pickupDatetime: 'asc',
      },
    });
  }

  /*
   * =====================================================
   * DRIVER APP - STATUS
   * =====================================================
   */

  async updateMyStatus(userId: string, status: DriverStatus) {
    const driver = await this.getDriverForApp(userId);

    if (driver.status === DriverStatus.INACTIVE) {
      throw new BadRequestException(
        'Inactive driver status is admin controlled',
      );
    }

    if (driver.status === DriverStatus.BUSY) {
      throw new BadRequestException(
        'Status cannot be changed manually during an active trip',
      );
    }

    if (status === DriverStatus.BUSY) {
      throw new BadRequestException('BUSY status is system controlled');
    }

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

  /*
   * =====================================================
   * DRIVER APP - LOCATION
   * =====================================================
   */

  async updateLocation(userId: string, latitude: number, longitude: number) {
    this.validateCoordinates(latitude, longitude);

    const driver = await this.getDriverForApp(userId);

    if (driver.status === DriverStatus.INACTIVE) {
      throw new BadRequestException(
        'Inactive drivers cannot update live location',
      );
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

  /*
   * =====================================================
   * NEAREST DRIVER
   * =====================================================
   */

  async findNearestDrivers(latitude: number, longitude: number) {
    this.validateCoordinates(latitude, longitude);

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

      select: {
        id: true,
        name: true,
        phone: true,
        photo: true,

        driverType: true,
        callSign: true,
        driverGrade: true,

        vehicleName: true,
        vehicleNumber: true,

        status: true,

        latitude: true,
        longitude: true,
        lastLocationUpdate: true,
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

  /*
   * =====================================================
   * LIVE DRIVER MAP
   * =====================================================
   */

  async getLiveDrivers() {
    return this.prisma.driver.findMany({
      where: {
        status: {
          not: DriverStatus.INACTIVE,
        },
        latitude: {
          not: null,
        },
        longitude: {
          not: null,
        },
      },

      select: {
        id: true,
        name: true,
        phone: true,
        photo: true,
        vehicleName: true,
        vehicleNumber: true,
        status: true,
        latitude: true,
        longitude: true,
        lastLocationUpdate: true,
      },

      orderBy: {
        name: 'asc',
      },
    });
  }
}
