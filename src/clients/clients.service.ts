import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  CreateBookerDto,
  CreateClientAccountDto,
  CreatePassengerDto,
  UpdateBookerDto,
  UpdateClientAccountDto,
  UpdatePassengerDto,
} from './dto/clients.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /* =====================================================
     HELPERS
  ===================================================== */

  private cleanOptionalString(value: string | undefined): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    const cleaned = value.trim();

    return cleaned || undefined;
  }

  private async ensureAccountExists(accountId?: string) {
    if (!accountId) {
      return;
    }

    const account = await this.prisma.clientAccount.findUnique({
      where: {
        id: accountId,
      },

      select: {
        id: true,
      },
    });

    if (!account) {
      throw new NotFoundException('Client account not found');
    }
  }

  /* =====================================================
     CLIENT ACCOUNTS
  ===================================================== */

  async getAccounts(search?: string, active?: string) {
    const cleanSearch = search?.trim() || undefined;

    let activeValue: boolean | undefined;

    if (active === 'true') {
      activeValue = true;
    }

    if (active === 'false') {
      activeValue = false;
    }

    return this.prisma.clientAccount.findMany({
      where: {
        ...(activeValue !== undefined
          ? {
              isActive: activeValue,
            }
          : {}),

        ...(cleanSearch
          ? {
              OR: [
                {
                  name: {
                    contains: cleanSearch,
                    mode: 'insensitive',
                  },
                },

                {
                  accountCode: {
                    contains: cleanSearch,
                    mode: 'insensitive',
                  },
                },

                {
                  email: {
                    contains: cleanSearch,
                    mode: 'insensitive',
                  },
                },

                {
                  phone: {
                    contains: cleanSearch,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },

      orderBy: {
        name: 'asc',
      },

      include: {
        _count: {
          select: {
            bookers: true,
            passengers: true,
            bookings: true,
          },
        },
      },
    });
  }

  async getAccount(id: string) {
    const account = await this.prisma.clientAccount.findUnique({
      where: {
        id,
      },

      include: {
        bookers: {
          orderBy: {
            name: 'asc',
          },
        },

        passengers: {
          orderBy: {
            name: 'asc',
          },
        },

        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Client account not found');
    }

    return account;
  }

  async createAccount(dto: CreateClientAccountDto) {
    const name = dto.name.trim();

    if (!name) {
      throw new BadRequestException('Account name is required');
    }

    return this.prisma.clientAccount.create({
      data: {
        name,

        accountCode: this.cleanOptionalString(dto.accountCode),

        email: this.cleanOptionalString(dto.email),

        phone: this.cleanOptionalString(dto.phone),

        billingAddress: this.cleanOptionalString(dto.billingAddress),

        notes: this.cleanOptionalString(dto.notes),

        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateAccount(id: string, dto: UpdateClientAccountDto) {
    await this.getAccount(id);

    return this.prisma.clientAccount.update({
      where: {
        id,
      },

      data: {
        ...(dto.name !== undefined
          ? {
              name: dto.name.trim(),
            }
          : {}),

        ...(dto.accountCode !== undefined
          ? {
              accountCode: dto.accountCode.trim() || null,
            }
          : {}),

        ...(dto.email !== undefined
          ? {
              email: dto.email.trim() || null,
            }
          : {}),

        ...(dto.phone !== undefined
          ? {
              phone: dto.phone.trim() || null,
            }
          : {}),

        ...(dto.billingAddress !== undefined
          ? {
              billingAddress: dto.billingAddress.trim() || null,
            }
          : {}),

        ...(dto.notes !== undefined
          ? {
              notes: dto.notes.trim() || null,
            }
          : {}),

        ...(dto.isActive !== undefined
          ? {
              isActive: dto.isActive,
            }
          : {}),
      },
    });
  }

  /* =====================================================
     BOOKERS
  ===================================================== */

  async getBookers(accountId?: string, search?: string) {
    const cleanSearch = search?.trim() || undefined;

    return this.prisma.booker.findMany({
      where: {
        ...(accountId
          ? {
              accountId,
            }
          : {}),

        ...(cleanSearch
          ? {
              OR: [
                {
                  name: {
                    contains: cleanSearch,
                    mode: 'insensitive',
                  },
                },

                {
                  firstName: {
                    contains: cleanSearch,
                    mode: 'insensitive',
                  },
                },

                {
                  lastName: {
                    contains: cleanSearch,
                    mode: 'insensitive',
                  },
                },

                {
                  email: {
                    contains: cleanSearch,
                    mode: 'insensitive',
                  },
                },

                {
                  phone: {
                    contains: cleanSearch,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },

      orderBy: {
        name: 'asc',
      },

      include: {
        account: {
          select: {
            id: true,
            name: true,
            accountCode: true,
          },
        },
      },
    });
  }

  async getBooker(id: string) {
    const booker = await this.prisma.booker.findUnique({
      where: {
        id,
      },

      include: {
        account: {
          select: {
            id: true,
            name: true,
            accountCode: true,
          },
        },
      },
    });

    if (!booker) {
      throw new NotFoundException('Booker not found');
    }

    return booker;
  }

  async createBooker(dto: CreateBookerDto) {
    await this.ensureAccountExists(dto.accountId);

    const name = dto.name.trim();

    if (!name) {
      throw new BadRequestException('Booker name is required');
    }

    return this.prisma.booker.create({
      data: {
        accountId: dto.accountId || null,

        firstName: this.cleanOptionalString(dto.firstName),

        lastName: this.cleanOptionalString(dto.lastName),

        name,

        phone: this.cleanOptionalString(dto.phone),

        email: this.cleanOptionalString(dto.email),

        notes: this.cleanOptionalString(dto.notes),
      },

      include: {
        account: {
          select: {
            id: true,
            name: true,
            accountCode: true,
          },
        },
      },
    });
  }

  async updateBooker(id: string, dto: UpdateBookerDto) {
    await this.getBooker(id);

    if (dto.accountId !== undefined) {
      await this.ensureAccountExists(dto.accountId);
    }

    return this.prisma.booker.update({
      where: {
        id,
      },

      data: {
        ...(dto.accountId !== undefined
          ? {
              accountId: dto.accountId || null,
            }
          : {}),

        ...(dto.firstName !== undefined
          ? {
              firstName: dto.firstName.trim() || null,
            }
          : {}),

        ...(dto.lastName !== undefined
          ? {
              lastName: dto.lastName.trim() || null,
            }
          : {}),

        ...(dto.name !== undefined
          ? {
              name: dto.name.trim(),
            }
          : {}),

        ...(dto.phone !== undefined
          ? {
              phone: dto.phone.trim() || null,
            }
          : {}),

        ...(dto.email !== undefined
          ? {
              email: dto.email.trim() || null,
            }
          : {}),

        ...(dto.notes !== undefined
          ? {
              notes: dto.notes.trim() || null,
            }
          : {}),
      },

      include: {
        account: {
          select: {
            id: true,
            name: true,
            accountCode: true,
          },
        },
      },
    });
  }

  /* =====================================================
     PASSENGERS
  ===================================================== */

  async getPassengers(accountId?: string, search?: string) {
    const cleanSearch = search?.trim() || undefined;

    return this.prisma.passenger.findMany({
      where: {
        ...(accountId
          ? {
              accountId,
            }
          : {}),

        ...(cleanSearch
          ? {
              OR: [
                {
                  name: {
                    contains: cleanSearch,
                    mode: 'insensitive',
                  },
                },

                {
                  firstName: {
                    contains: cleanSearch,
                    mode: 'insensitive',
                  },
                },

                {
                  lastName: {
                    contains: cleanSearch,
                    mode: 'insensitive',
                  },
                },

                {
                  email: {
                    contains: cleanSearch,
                    mode: 'insensitive',
                  },
                },

                {
                  phone: {
                    contains: cleanSearch,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },

      orderBy: {
        name: 'asc',
      },

      include: {
        account: {
          select: {
            id: true,
            name: true,
            accountCode: true,
          },
        },
      },
    });
  }

  async getPassenger(id: string) {
    const passenger = await this.prisma.passenger.findUnique({
      where: {
        id,
      },

      include: {
        account: {
          select: {
            id: true,
            name: true,
            accountCode: true,
          },
        },
      },
    });

    if (!passenger) {
      throw new NotFoundException('Passenger not found');
    }

    return passenger;
  }

  async createPassenger(dto: CreatePassengerDto) {
    await this.ensureAccountExists(dto.accountId);

    const name = dto.name.trim();

    if (!name) {
      throw new BadRequestException('Passenger name is required');
    }

    return this.prisma.passenger.create({
      data: {
        accountId: dto.accountId || null,

        firstName: this.cleanOptionalString(dto.firstName),

        lastName: this.cleanOptionalString(dto.lastName),

        name,

        phone: this.cleanOptionalString(dto.phone),

        email: this.cleanOptionalString(dto.email),

        notes: this.cleanOptionalString(dto.notes),
      },

      include: {
        account: {
          select: {
            id: true,
            name: true,
            accountCode: true,
          },
        },
      },
    });
  }

  async updatePassenger(id: string, dto: UpdatePassengerDto) {
    await this.getPassenger(id);

    if (dto.accountId !== undefined) {
      await this.ensureAccountExists(dto.accountId);
    }

    return this.prisma.passenger.update({
      where: {
        id,
      },

      data: {
        ...(dto.accountId !== undefined
          ? {
              accountId: dto.accountId || null,
            }
          : {}),

        ...(dto.firstName !== undefined
          ? {
              firstName: dto.firstName.trim() || null,
            }
          : {}),

        ...(dto.lastName !== undefined
          ? {
              lastName: dto.lastName.trim() || null,
            }
          : {}),

        ...(dto.name !== undefined
          ? {
              name: dto.name.trim(),
            }
          : {}),

        ...(dto.phone !== undefined
          ? {
              phone: dto.phone.trim() || null,
            }
          : {}),

        ...(dto.email !== undefined
          ? {
              email: dto.email.trim() || null,
            }
          : {}),

        ...(dto.notes !== undefined
          ? {
              notes: dto.notes.trim() || null,
            }
          : {}),
      },

      include: {
        account: {
          select: {
            id: true,
            name: true,
            accountCode: true,
          },
        },
      },
    });
  }
}
