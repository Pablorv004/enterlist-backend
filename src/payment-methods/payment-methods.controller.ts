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
import { OwnershipGuard } from '../auth/guards/ownership.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Ownership } from '../auth/decorators/ownership.decorator';
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
    }    @UseGuards(OwnershipGuard)
    @Ownership({ model: 'user', userField: 'user_id', paramName: 'artistId' })
    @Get('artist/:artistId')
    findByArtist(@Param('artistId') artistId: string) {
        return this.paymentMethodsService.findByArtist(artistId);
    }

    @UseGuards(OwnershipGuard)
    @Ownership({ model: 'paymentMethod', userField: 'artist_id' })
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.paymentMethodsService.findOne(id);
    }

    @Post()
    create(@Body() createPaymentMethodDto: CreatePaymentMethodDto) {
        return this.paymentMethodsService.create(createPaymentMethodDto);
    }    @UseGuards(OwnershipGuard)
    @Ownership({ model: 'paymentMethod', userField: 'artist_id' })
    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() updatePaymentMethodDto: UpdatePaymentMethodDto,
    ) {
        return this.paymentMethodsService.update(id, updatePaymentMethodDto);
    }

    @UseGuards(OwnershipGuard)
    @Ownership({ model: 'paymentMethod', userField: 'artist_id' })
    @Delete(':id')
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
}

