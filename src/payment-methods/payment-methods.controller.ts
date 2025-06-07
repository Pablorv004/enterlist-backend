import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  UseGuards,
  Logger,
  Req,
} from '@nestjs/common';
import { PaymentMethodsService } from './payment-methods.service';
import {
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
} from './dto/payment-method.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailConfirmedGuard } from '../auth/guards/email-confirmed.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RoleRequiredGuard } from '../auth/guards/role-required.guard';
import { OwnershipGuard } from '../auth/guards/ownership.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Ownership } from '../auth/decorators/ownership.decorator';
import { user_role } from '@prisma/client';
import { PaypalAuthService } from '../paypal-auth/paypal-auth.service';

@Controller('api/payment-methods')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard)
export class PaymentMethodsController {
  private readonly logger = new Logger(PaymentMethodsController.name);
  constructor(
    private readonly paymentMethodsService: PaymentMethodsService,
    private readonly paypalAuthService: PaypalAuthService,
  ) {}

  @UseGuards(OwnershipGuard)
  @Ownership({ model: 'user', userField: 'user_id', paramName: 'userId' })
  @Get('user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.paymentMethodsService.findByUser(userId);
  }

  @UseGuards(OwnershipGuard)
  @Ownership({ model: 'paymentMethod', userField: 'user_id' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentMethodsService.findOne(id);
  }

  @Post()
  create(@Body() createPaymentMethodDto: CreatePaymentMethodDto) {
    return this.paymentMethodsService.create(createPaymentMethodDto);
  }
  @UseGuards(OwnershipGuard)
  @Ownership({ model: 'paymentMethod', userField: 'user_id' })
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updatePaymentMethodDto: UpdatePaymentMethodDto,
  ) {
    return this.paymentMethodsService.update(id, updatePaymentMethodDto);
  }

  @UseGuards(OwnershipGuard)
  @Ownership({ model: 'paymentMethod', userField: 'user_id' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.paymentMethodsService.remove(id);
  } // PayPal specific endpoints
  @Post('create-paypal-token')
  async createPaypalToken(@Body() body: { email: string }, @Req() req) {
    const { email } = body;

    if (!email) {
      throw new Error('Email is required');
    }

    // Verify that the email matches the user's PayPal account
    try {
      const userPayPalEmail = await this.paypalAuthService.getUserPayPalEmail(
        req.user.user_id,
      );
      if (email !== userPayPalEmail) {
        throw new Error('Email must match your linked PayPal account');
      }
    } catch (error) {
      // If user doesn't have PayPal linked, they need to link it first
      throw new Error('Please link your PayPal account first');
    }

    const token = await this.createPaymentToken(email);
    return { token };
  }

  private async createPaymentToken(paypalEmail: string): Promise<string> {
    try {
      // Create a secure token that includes the email
      // In a real implementation, this would integrate with PayPal's Vault API
      const mockToken = `pp_token_${Buffer.from(paypalEmail)
        .toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 20)}_${Date.now()}`;

      this.logger.log(`Created PayPal payment token for email: ${paypalEmail}`);

      return mockToken;
    } catch (error) {
      this.logger.error('PayPal token creation error:', error);
      throw new Error('Failed to create PayPal payment token');
    }
  }
}
