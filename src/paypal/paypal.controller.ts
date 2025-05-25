import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaypalService } from './paypal.service';

@Controller('api/payment-methods')
@UseGuards(JwtAuthGuard)
export class PaypalController {
    constructor(private readonly paypalService: PaypalService) {}

    @Post('create-paypal-token')
    async createPaypalToken(@Body() body: { email: string }) {
        const { email } = body;
        
        if (!email) {
            throw new Error('Email is required');
        }

        const token = await this.paypalService.createPaymentToken(email);
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
