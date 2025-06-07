import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SkipEmailConfirmation } from '../auth/decorators/skip-email-confirmation.decorator';
import { EmailService } from './email.service';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Controller('api/email')
export class EmailController {
  constructor(
    private emailService: EmailService,
    private prismaService: PrismaService,
  ) {}

  @Post('confirm')
  @SkipEmailConfirmation()
  async confirmEmail(@Body('token') token: string) {
    if (!token) {
      throw new BadRequestException('Confirmation token is required');
    }

    const user = await this.prismaService.user.findFirst({
      where: { email_confirmation_token: token },
    });

    if (!user) {
      throw new NotFoundException('Invalid or expired confirmation token');
    }

    await this.prismaService.user.update({
      where: { user_id: user.user_id },
      data: {
        email_confirmed: true,
        email_confirmation_token: null,
      },
    });

    return { message: 'Email confirmed successfully' };
  }

  @Post('resend-confirmation')
  @UseGuards(JwtAuthGuard)
  @SkipEmailConfirmation()
  async resendConfirmation(@Req() req) {
    const user = await this.prismaService.user.findUnique({
      where: { user_id: req.user.user_id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.email_confirmed) {
      throw new BadRequestException('Email is already confirmed');
    }

    if (user.oauth_provider) {
      throw new BadRequestException(
        'OAuth users do not need email confirmation',
      );
    }

    // Generate new confirmation token
    const confirmationToken = crypto.randomBytes(32).toString('hex');

    await this.prismaService.user.update({
      where: { user_id: user.user_id },
      data: { email_confirmation_token: confirmationToken },
    });

    // Send confirmation email
    await this.emailService.sendEmailConfirmation(
      user.email,
      user.username,
      confirmationToken,
    );

    return { message: 'Confirmation email sent' };
  }

  @Get('confirmation-status')
  @UseGuards(JwtAuthGuard)
  @SkipEmailConfirmation()
  async getConfirmationStatus(@Req() req) {
    const user = await this.prismaService.user.findUnique({
      where: { user_id: req.user.user_id },
      select: {
        email_confirmed: true,
        oauth_provider: true,
        email: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      emailConfirmed: user.email_confirmed || !!user.oauth_provider,
      isOAuthUser: !!user.oauth_provider,
      email: user.email,
    };
  }
}
