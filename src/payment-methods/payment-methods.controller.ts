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
} from '@nestjs/common';
import { PaymentMethodsService } from './payment-methods.service';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './dto/payment-method.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RoleRequiredGuard } from '../auth/guards/role-required.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { user_role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Controller('api/payment-methods')
@UseGuards(JwtAuthGuard, RoleRequiredGuard)
export class PaymentMethodsController {
    private readonly logger = new Logger(PaymentMethodsController.name);
    private clientId: string;
    private clientSecret: string;
    private environment: string;

    constructor(
        private readonly paymentMethodsService: PaymentMethodsService,
        private readonly configService: ConfigService,
    ) {
        // Initialize PayPal configuration
        this.clientId = this.configService.get<string>('PAYPAL_CLIENT_ID') || '';
        this.clientSecret = this.configService.get<string>('PAYPAL_CLIENT_SECRET') || '';
        this.environment = this.configService.get<string>('PAYPAL_MODE', 'sandbox');

        if (!this.clientId || !this.clientSecret) {
            this.logger.warn('PayPal client ID or secret is missing - PayPal payments will not work');
        } else {
            this.logger.log(`PayPal service initialized in ${this.environment} mode`);
        }
    }

    @UseGuards(RolesGuard)
    @Roles(user_role.admin)
    @Get()
    findAll() {
        return this.paymentMethodsService.findAll();
    }

    @Get('artist/:artistId')
    findByArtist(@Param('artistId') artistId: string) {
        return this.paymentMethodsService.findByArtist(artistId);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.paymentMethodsService.findOne(id);
    }

    @Post()
    create(@Body() createPaymentMethodDto: CreatePaymentMethodDto) {
        return this.paymentMethodsService.create(createPaymentMethodDto);
    }

    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() updatePaymentMethodDto: UpdatePaymentMethodDto,
    ) {
        return this.paymentMethodsService.update(id, updatePaymentMethodDto);
    }    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.paymentMethodsService.remove(id);
    }    // PayPal specific endpoints
    @Post('create-paypal-token')
    async createPaypalToken(@Body() body: { email: string }) {
        const { email } = body;
        
        if (!email) {
            throw new Error('Email is required');
        }

        const token = await this.createPaymentToken(email);
        return { token };
    }

    @Post('tokenize-card')
    async tokenizeCard(@Body() cardData: any) {
        // This would normally use a service like Stripe to securely tokenize the card
        // For security reasons, we would not implement this directly, but use a third-party service
        
        // For the purpose of this example, we're returning a mock token
        // In a real implementation, this would be handled by a secure payment processor
        const mockToken = 'card_tok_' + Math.random().toString(36).substring(2, 15);
        
        return {
            providerToken: mockToken,
            cardBrand: this.detectCardBrand(cardData.cardNumber),
            last4: cardData.cardNumber.slice(-4)
        };
    }

    private async createPaymentToken(paypalEmail: string): Promise<string> {
        try {
            // For now, we'll create a mock token that includes the email
            // In a real implementation, this would integrate with PayPal's Vault API
            const mockToken = `pp_${this.environment}_${Buffer.from(paypalEmail).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20)}_${Date.now()}`;
            
            this.logger.log(`Created PayPal payment token for email: ${paypalEmail}`);
            
            return mockToken;
        } catch (error) {
            this.logger.error('PayPal token creation error:', error);
            throw new Error('Failed to create PayPal payment token');
        }
    }

    private detectCardBrand(cardNumber: string): string {
        // Basic card brand detection based on BIN ranges
        if (!cardNumber) return 'Unknown';
        
        const firstDigit = cardNumber.charAt(0);
        const firstTwoDigits = cardNumber.substring(0, 2);
        const firstFourDigits = cardNumber.substring(0, 4);
        
        if (firstDigit === '4') return 'Visa';
        if (['51', '52', '53', '54', '55'].includes(firstTwoDigits)) return 'MasterCard';
        if (['34', '37'].includes(firstTwoDigits)) return 'American Express';
        if (['6011', '644', '645', '646', '647', '648', '649', '65'].some(prefix => 
            cardNumber.startsWith(prefix))) return 'Discover';
        
        return 'Unknown';
    }
}

