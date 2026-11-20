import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { CreateRefundRequestDto } from './dto/create-refund-request.dto';
import { RejectRefundRequestDto } from './dto/reject-refund-request.dto';
import { RefundsService } from './refunds.service';

@UseGuards(
  JwtAuthGuard,
  RolesGuard,
)
@Roles('ADMIN')
@Controller('finance/refunds')
export class RefundsController {
  constructor(
    private readonly refundsService: RefundsService,
  ) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('month') month?: string,
    @Query('accountId') accountId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.refundsService.list({
      search,
      status,
      month,
      accountId,
      page,
      limit,
    });
  }

  @Get('payment-search')
  searchPayments(
    @Query('search') search?: string,
  ) {
    return this.refundsService.searchPayments(
      search,
    );
  }

  @Post()
  create(
    @Body()
    dto: CreateRefundRequestDto,
  ) {
    return this.refundsService.create(
      dto,
    );
  }

  @Post(':id/approve')
  approve(
    @Param('id')
    id: string,
  ) {
    return this.refundsService.approve(
      id,
    );
  }

  @Post(':id/sync')
  sync(
    @Param('id')
    id: string,
  ) {
    return this.refundsService.sync(
      id,
    );
  }

  @Patch(':id/reject')
  reject(
    @Param('id')
    id: string,

    @Body()
    dto: RejectRefundRequestDto,
  ) {
    return this.refundsService.reject(
      id,
      dto,
    );
  }
}
