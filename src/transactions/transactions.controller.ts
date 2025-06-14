import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  UseGuards,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  Req,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailConfirmedGuard } from '../auth/guards/email-confirmed.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RoleRequiredGuard } from '../auth/guards/role-required.guard';
import { OwnershipGuard } from '../auth/guards/ownership.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Ownership } from '../auth/decorators/ownership.decorator';

import { user_role, transaction_status } from '@prisma/client';

@Controller('api/transactions')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @UseGuards(RoleRequiredGuard, OwnershipGuard)
  @Ownership({ model: 'user', userField: 'user_id', paramName: 'artistId' })
  @Get('artist/:artistId')
  findByArtist(
    @Param('artistId') artistId: string,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
  ) {
    return this.transactionsService.findByArtist(artistId, skip, take);
  }
  @UseGuards(RoleRequiredGuard, OwnershipGuard)
  @Ownership({ model: 'transaction', userField: 'artist_id' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactionsService.findOne(id);
  }
  @UseGuards(RolesGuard, RoleRequiredGuard)
  @Roles(user_role.artist, user_role.admin)
  @Post()
  create(@Body() createTransactionDto: CreateTransactionDto) {
    return this.transactionsService.create(createTransactionDto);
  }
  @UseGuards(RolesGuard, OwnershipGuard)
  @Roles(user_role.admin)
  @Ownership({ model: 'transaction', userField: 'artist_id' })
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateTransactionDto: UpdateTransactionDto,
  ) {
    return this.transactionsService.update(id, updateTransactionDto);
  }

  // Playlist maker endpoints
  @UseGuards(RoleRequiredGuard)
  @Roles(user_role.playlist_maker)
  @Get('playlist-maker/transactions')
  findByPlaylistOwner(
    @Req() req,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
  ) {
    return this.transactionsService.findByPlaylistOwner(
      req.user.user_id,
      skip,
      take,
    );
  }

  @UseGuards(RoleRequiredGuard)
  @Roles(user_role.playlist_maker)
  @Get('playlist-maker/balance')
  getPlaylistMakerBalance(@Req() req) {
    return this.transactionsService.getPlaylistMakerBalance(req.user.user_id);
  }
  @UseGuards(RoleRequiredGuard)
  @Roles(user_role.playlist_maker)
  @Get('playlist-maker/earnings-stats')
  getEarningsStats(
    @Req() req,
    @Query('period') period: 'week' | 'month' | 'year' = 'week',
  ) {
    return this.transactionsService.getEarningsStats(req.user.user_id, period);
  }

  @UseGuards(RoleRequiredGuard)
  @Roles(user_role.playlist_maker)
  @Post('playlist-maker/withdraw')
  withdrawFunds(@Req() req, @Body() body: { amount: number }) {
    return this.transactionsService.withdrawFunds(
      req.user.user_id,
      body.amount,
    );
  }

  @UseGuards(RoleRequiredGuard)
  @Roles(user_role.playlist_maker)
  @Get('playlist-maker/withdrawals')
  getWithdrawals(
    @Req() req,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
  ) {
    return this.transactionsService.getWithdrawals(
      req.user.user_id,
      skip,
      take,
    );
  }

  // PayPal payment endpoints
  @UseGuards(RoleRequiredGuard)
  @Roles(user_role.artist)
  @Post('paypal/create-payment')
  createPayPalPayment(
    @Req() req,
    @Body() body: { submissionId: string; paymentMethodId: string },
    @Query('mobile') mobile?: string,
  ) {
    const isMobile = mobile === 'true' || req.headers['user-agent']?.includes('Capacitor');

    // Use mobile-specific URLs if request is from a mobile device
    const baseUrl = isMobile
      ? 'com.enterlist.app'
      : (process.env.FRONTEND_URL || 'http://localhost:8080');

    const returnUrl = isMobile 
      ? `${baseUrl}://payment/success?submissionId=${body.submissionId}`
      : `${baseUrl}/payment/success`;
    const cancelUrl = isMobile 
      ? `${baseUrl}://artist/submissions/new`
      : `${baseUrl}/artist/submissions/new`;

    return this.transactionsService.processPayPalPayment(
      body.submissionId,
      body.paymentMethodId,
      returnUrl,
      cancelUrl,
    );
  }

  @UseGuards(RoleRequiredGuard)
  @Roles(user_role.artist)
  @Post('paypal/execute-payment')
  executePayPalPayment(
    @Req() req,
    @Body()
    body: { paymentId: string; payerId: string; transactionId?: string },
  ) {
    return this.transactionsService.executePayPalPayment(
      body.paymentId,
      body.payerId,
    );
  }

  @UseGuards(RoleRequiredGuard)
  @Roles(user_role.artist)
  @Get('paypal/payment-details/:submissionId')
  async getPaymentDetailsBySubmission(
    @Req() req,
    @Param('submissionId') submissionId: string,
    @Query('paymentId') paymentId?: string,
    @Query('PayerID') payerId?: string,
  ) {
    return this.transactionsService.getPaymentDetailsBySubmission(
      submissionId,
      paymentId,
      payerId,
    );
  }

  // Artist endpoints
  @UseGuards(RoleRequiredGuard)
  @Roles(user_role.artist)
  @Get('artist/transactions')
  getArtistTransactions(
    @Req() req,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
  ) {
    return this.transactionsService.findByArtist(req.user.user_id, skip, take);
  }

  @UseGuards(RoleRequiredGuard)
  @Roles(user_role.artist)
  @Post('paypal/complete-mobile-payment')
  completeMobilePayPalPayment(
    @Req() req,
    @Body() body: { submissionId: string },
  ) {
    return this.transactionsService.completeMobilePayPalPayment(
      body.submissionId,
    );
  }
}
