import { Module } from '@nestjs/common';

import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

import { PrismaService } from '../prisma/prisma.service';

import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,

    JwtModule.register({
      secret: 'SUPER_SECRET_KEY',

      signOptions: {
        expiresIn: '7d',
      },
    }),
  ],

  controllers: [AuthController],

  providers: [AuthService, PrismaService, JwtStrategy],

  exports: [JwtModule],
})
export class AuthModule {}
