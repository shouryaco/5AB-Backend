import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';

import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /* =====================================================
     TOKEN
  ===================================================== */

  private signUserToken(user: {
    id: string;
    email: string;
    role: string;
  }) {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  /* =====================================================
     REGISTER
  ===================================================== */

  async register(createUserDto: CreateUserDto) {
    const name = createUserDto.name.trim();
    const email = createUserDto.email.trim().toLowerCase();

    if (!name) {
      throw new BadRequestException('Name is required');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(
      createUserDto.password,
      10,
    );

    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: createUserDto.role as any,
      },
      select: safeUserSelect,
    });

    return {
      message: 'User created successfully',
      user,
    };
  }

  /* =====================================================
     LOGIN
  ===================================================== */

  async login(loginDto: LoginDto) {
    const email = loginDto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const safeUser = await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        lastLoginAt: new Date(),
      },
      select: safeUserSelect,
    });

    return {
      access_token: this.signUserToken({
        id: safeUser.id,
        email: safeUser.email,
        role: safeUser.role,
      }),
      user: safeUser,
    };
  }

  /* =====================================================
     CURRENT PROFILE
  ===================================================== */

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: safeUserSelect,
    });

    if (!user) {
      throw new NotFoundException('User account not found');
    }

    return user;
  }

  /* =====================================================
     UPDATE CURRENT PROFILE
  ===================================================== */

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const currentUser = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (!currentUser) {
      throw new NotFoundException('User account not found');
    }

    const data: {
      name?: string;
      email?: string;
    } = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();

      if (!name) {
        throw new BadRequestException('Name cannot be empty');
      }

      data.name = name;
    }

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();

      if (!email) {
        throw new BadRequestException('Email cannot be empty');
      }

      if (email !== currentUser.email.toLowerCase()) {
        const existingUser = await this.prisma.user.findUnique({
          where: {
            email,
          },
          select: {
            id: true,
          },
        });

        if (existingUser && existingUser.id !== userId) {
          throw new ConflictException(
            'A user with this email already exists',
          );
        }
      }

      data.email = email;
    }

    const user = await this.prisma.user.update({
      where: {
        id: userId,
      },
      data,
      select: safeUserSelect,
    });

    return {
      message: 'Profile updated successfully',
      user,
      access_token: this.signUserToken({
        id: user.id,
        email: user.email,
        role: user.role,
      }),
    };
  }

  /* =====================================================
     CHANGE CURRENT PASSWORD
  ===================================================== */

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        password: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User account not found');
    }

    const passwordMatch = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );

    if (!passwordMatch) {
      throw new UnauthorizedException(
        'Current password is incorrect',
      );
    }

    const sameAsCurrent = await bcrypt.compare(
      dto.newPassword,
      user.password,
    );

    if (sameAsCurrent) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const hashedPassword = await bcrypt.hash(
      dto.newPassword,
      10,
    );

    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        password: hashedPassword,
      },
    });

    return {
      message: 'Password changed successfully',
    };
  }
}
