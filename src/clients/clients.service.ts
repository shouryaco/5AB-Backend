import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { isUUID } from 'class-validator';

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

  private requireNonEmptyString(value: string, fieldLabel: string) {
    const cleaned = value.trim();

    if (!cleaned) {
      throw new BadRequestException(`${fieldLabel} is required`);
    }

    return cleaned;
  }

  private validateOptionalAccountId(accountId?: string) {
    if (!accountId) {
      return;
    }

    if (!isUUID(accountId)) {
      throw new BadRequestException('Invalid client account ID');
    }
  }

  private async ensureAccountExists(accountId?: string) {
    if (!accountId) {
      return;
    }

    this.validateOptionalAccountId(accountId);

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

    if (active !== undefined && active !== '') {
      if (active === 'true') {
        activeValue = true;
      } else if (active === 'false') {
        activeValue = false;
      } else {
        throw new BadRequestException(
          'Active filter must be either true or false',
        );
      }
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
    if (!isUUID(id)) {
      throw new BadRequestException('Invalid client account ID');
    }

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
    const name = this.requireNonEmptyString(dto.name, 'Account name');

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

    const data: {
      name?: string;
      accountCode?: string | null;
      email?: string | null;
      phone?: string | null;
      billingAddress?: string | null;
      notes?: string | null;
      isActive?: boolean;
    } = {};

    if (dto.name !== undefined) {
      data.name = this.requireNonEmptyString(dto.name, 'Account name');
    }

    if (dto.accountCode !== undefined) {
      data.accountCode = dto.accountCode.trim() || null;
    }

    if (dto.email !== undefined) {
      data.email = dto.email.trim() || null;
    }

    if (dto.phone !== undefined) {
      data.phone = dto.phone.trim() || null;
    }

    if (dto.billingAddress !== undefined) {
      data.billingAddress = dto.billingAddress.trim() || null;
    }

    if (dto.notes !== undefined) {
      data.notes = dto.notes.trim() || null;
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    return this.prisma.clientAccount.update({
      where: {
        id,
      },

      data,
    });
  }

  /* =====================================================
     BOOKERS
  ===================================================== */

  async getBookers(accountId?: string, search?: string) {
    if (accountId) {
      this.validateOptionalAccountId(accountId);
    }

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
    if (!isUUID(id)) {
      throw new BadRequestException('Invalid booker ID');
    }

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

    const name = this.requireNonEmptyString(dto.name, 'Booker name');

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

    const data: {
      accountId?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      name?: string;
      phone?: string | null;
      email?: string | null;
      notes?: string | null;
    } = {};

    if (dto.accountId !== undefined) {
      data.accountId = dto.accountId || null;
    }

    if (dto.firstName !== undefined) {
      data.firstName = dto.firstName.trim() || null;
    }

    if (dto.lastName !== undefined) {
      data.lastName = dto.lastName.trim() || null;
    }

    if (dto.name !== undefined) {
      data.name = this.requireNonEmptyString(dto.name, 'Booker name');
    }

    if (dto.phone !== undefined) {
      data.phone = dto.phone.trim() || null;
    }

    if (dto.email !== undefined) {
      data.email = dto.email.trim() || null;
    }

    if (dto.notes !== undefined) {
      data.notes = dto.notes.trim() || null;
    }

    return this.prisma.booker.update({
      where: {
        id,
      },

      data,

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
    if (accountId) {
      this.validateOptionalAccountId(accountId);
    }

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
    if (!isUUID(id)) {
      throw new BadRequestException('Invalid passenger ID');
    }

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

    const name = this.requireNonEmptyString(dto.name, 'Passenger name');

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

    const data: {
      accountId?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      name?: string;
      phone?: string | null;
      email?: string | null;
      notes?: string | null;
    } = {};

    if (dto.accountId !== undefined) {
      data.accountId = dto.accountId || null;
    }

    if (dto.firstName !== undefined) {
      data.firstName = dto.firstName.trim() || null;
    }

    if (dto.lastName !== undefined) {
      data.lastName = dto.lastName.trim() || null;
    }

    if (dto.name !== undefined) {
      data.name = this.requireNonEmptyString(dto.name, 'Passenger name');
    }

    if (dto.phone !== undefined) {
      data.phone = dto.phone.trim() || null;
    }

    if (dto.email !== undefined) {
      data.email = dto.email.trim() || null;
    }

    if (dto.notes !== undefined) {
      data.notes = dto.notes.trim() || null;
    }

    return this.prisma.passenger.update({
      where: {
        id,
      },

      data,

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
