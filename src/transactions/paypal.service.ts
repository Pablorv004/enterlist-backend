import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PaypalService {
    private readonly logger = new Logger(PaypalService.name);
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly environment: string;
    private readonly baseUrl: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
    ) {
        this.clientId = this.configService.get<string>('PAYPAL_CLIENT_ID') || '';
        this.clientSecret = this.configService.get<string>('PAYPAL_CLIENT_SECRET') || '';
        this.environment = this.configService.get<string>('PAYPAL_MODE', 'sandbox');
        this.baseUrl = this.environment === 'live' 
            ? 'https://api.paypal.com' 
            : 'https://api.sandbox.paypal.com';

        if (!this.clientId || !this.clientSecret) {
            this.logger.warn('PayPal credentials are missing - PayPal payments will not work');
        } else {
            this.logger.log(`PayPal payments service initialized in ${this.environment} mode`);
        }
    }

    async getAccessToken(): Promise<string> {
        try {
            const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
            
            const response = await firstValueFrom(
                this.httpService.post(
                    `${this.baseUrl}/v1/oauth2/token`,
                    'grant_type=client_credentials',
                    {
                        headers: {
                            'Authorization': `Basic ${credentials}`,
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                    }
                )
            );

            return response.data.access_token;
        } catch (error) {
            this.logger.error('Failed to get PayPal access token:', error.response?.data || error.message);
            throw new UnauthorizedException('Failed to authenticate with PayPal');
        }
    }

    async createPayment(
        amount: number,
        currency: string,
        description: string,
        payeeEmail: string, // PayPal email of playlist maker
        returnUrl: string,
        cancelUrl: string
    ): Promise<any> {
        try {
            const accessToken = await this.getAccessToken();
            
            const paymentData = {
                intent: 'sale',
                payer: {
                    payment_method: 'paypal'
                },
                transactions: [{
                    amount: {
                        total: (amount / 100).toFixed(2), // Convert from cents
                        currency: currency
                    },
                    description: description,
                    payee: {
                        email: payeeEmail
                    }
                }],
                redirect_urls: {
                    return_url: returnUrl,
                    cancel_url: cancelUrl
                }
            };

            const response = await firstValueFrom(
                this.httpService.post(
                    `${this.baseUrl}/v1/payments/payment`,
                    paymentData,
                    {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                        },
                    }
                )
            );

            this.logger.log(`PayPal payment created with ID: ${response.data.id}`);
            return response.data;
        } catch (error) {
            this.logger.error('Failed to create PayPal payment:', error.response?.data || error.message);
            throw new BadRequestException('Failed to create PayPal payment');
        }
    }

    async executePayment(paymentId: string, payerId: string): Promise<any> {
        try {
            const accessToken = await this.getAccessToken();
            
            const executeData = {
                payer_id: payerId
            };

            const response = await firstValueFrom(
                this.httpService.post(
                    `${this.baseUrl}/v1/payments/payment/${paymentId}/execute`,
                    executeData,
                    {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                        },
                    }
                )
            );

            this.logger.log(`PayPal payment executed successfully: ${paymentId}`);
            return response.data;
        } catch (error) {
            this.logger.error('Failed to execute PayPal payment:', error.response?.data || error.message);
            throw new BadRequestException('Failed to execute PayPal payment');
        }
    }

    async getPayment(paymentId: string): Promise<any> {
        try {
            const accessToken = await this.getAccessToken();
            
            const response = await firstValueFrom(
                this.httpService.get(
                    `${this.baseUrl}/v1/payments/payment/${paymentId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                        },
                    }
                )
            );

            return response.data;
        } catch (error) {
            this.logger.error('Failed to get PayPal payment:', error.response?.data || error.message);
            throw new BadRequestException('Failed to get PayPal payment');
        }
    }

    async createPayout(
        recipientEmail: string,
        amount: number,
        currency: string,
        note: string
    ): Promise<any> {
        try {
            const accessToken = await this.getAccessToken();
            
            const payoutData = {
                sender_batch_header: {
                    sender_batch_id: `batch_${Date.now()}`,
                    email_subject: 'You have a payout!',
                    email_message: note
                },
                items: [{
                    recipient_type: 'EMAIL',
                    amount: {
                        value: (amount / 100).toFixed(2), // Convert from cents
                        currency: currency
                    },
                    note: note,
                    sender_item_id: `item_${Date.now()}`,
                    receiver: recipientEmail
                }]
            };

            const response = await firstValueFrom(
                this.httpService.post(
                    `${this.baseUrl}/v1/payments/payouts`,
                    payoutData,
                    {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                        },
                    }
                )
            );

            this.logger.log(`PayPal payout created: ${response.data.batch_header.payout_batch_id}`);
            return response.data;
        } catch (error) {
            this.logger.error('Failed to create PayPal payout:', error.response?.data || error.message);
            throw new BadRequestException('Failed to create PayPal payout');
        }
    }
}
