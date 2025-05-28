import { Injectable, UnauthorizedException, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaypalAuthService {
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly redirectUri: string;
    private readonly environment: string;
    private readonly baseUrl: string;
    private readonly stateMap = new Map<string, { userId?: string; expiresAt: Date; isNewUser?: boolean }>();
    private readonly logger = new Logger(PaypalAuthService.name);    constructor(
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
        private readonly prismaService: PrismaService,
        private readonly authService: AuthService,
    ) {this.clientId = this.configService.get<string>('PAYPAL_CLIENT_ID') || '';
        this.clientSecret = this.configService.get<string>('PAYPAL_CLIENT_SECRET') || '';
        this.environment = this.configService.get<string>('PAYPAL_MODE', 'sandbox');
        this.baseUrl = this.environment === 'live' 
            ? 'https://api.paypal.com' 
            : 'https://api.sandbox.paypal.com';
        this.redirectUri = `${this.configService.get<string>('API_BASE_URL')}/api/auth/paypal/callback`;

        if (!this.clientId || !this.clientSecret) {
            this.logger.warn('PayPal OAuth client ID or secret is missing');
        } else {
            this.logger.log(`PayPal OAuth service initialized in ${this.environment} mode`);
            this.logger.log(`PayPal Client ID: ${this.clientId}`);
            this.logger.log(`PayPal Redirect URI: ${this.redirectUri}`);
        }
    }

    async getAuthorizationUrl(userId?: string): Promise<string> {
        const state = crypto.randomBytes(32).toString('hex');
        
        // Store state with expiration (15 minutes)
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 15);
        
        this.stateMap.set(state, {
            userId,
            expiresAt,
            isNewUser: !userId, // If no userId provided, this is a new user registration
        });

        // Clean up expired states
        this.cleanupExpiredStates();        
        const scopes = [
            'openid',
            'email',
        ].join(' ');

        // Use the correct PayPal OAuth authorization URL based on environment
        const authBaseUrl = this.environment === 'live' 
            ? 'https://www.paypal.com/signin/authorize'
            : 'https://www.sandbox.paypal.com/signin/authorize';
            
        const authUrl = new URL(authBaseUrl);
        authUrl.searchParams.set('client_id', this.clientId);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', scopes);
        authUrl.searchParams.set('redirect_uri', this.redirectUri);
        authUrl.searchParams.set('state', state);

        this.logger.log(`Generated PayPal OAuth URL: ${authUrl.toString()}`);
        this.logger.log(`Redirect URI: ${this.redirectUri}`);

        this.logger.log(`Generated PayPal OAuth URL for ${userId ? 'existing user' : 'new user'}`);
        return authUrl.toString();
    }

    async handleCallback(code: string, state: string): Promise<any> {
        // Verify state parameter to prevent CSRF attacks
        if (!state || !this.stateMap.has(state)) {
            throw new UnauthorizedException('Invalid state parameter');
        }

        const stateData = this.stateMap.get(state);
        if (new Date() > stateData!.expiresAt) {
            this.stateMap.delete(state);
            throw new UnauthorizedException('State parameter expired');
        }

        const isNewUser = stateData!.isNewUser;
        let userId = stateData!.userId;

        this.stateMap.delete(state);

        // Exchange code for access and refresh tokens
        const tokenData = await this.exchangeCodeForTokens(code);

        // Get user profile from PayPal
        const profile = await this.getPayPalUserProfile(tokenData.access_token);        // ALWAYS check if a user with this PayPal ID already exists (regardless of isNewUser flag)
        const existingOAuthUser = await this.prismaService.user.findFirst({
            where: {
                oauth_provider: 'paypal',
                oauth_id: profile.user_id,
            }
        });

        if (existingOAuthUser) {
            // User already exists with this OAuth account, log them in
            userId = existingOAuthUser.user_id;

            const tokenResult = this.authService.generateToken(existingOAuthUser);

            // Check if user has a role - if not, they need role selection
            const needsRoleSelection = !existingOAuthUser.role;

            return {
                ...tokenResult,
                isNewUser: false,
                needsRoleSelection,
                user: existingOAuthUser
            };
        }

        // If this is a new user registration (from register-or-login endpoint)
        if (isNewUser) {
            // Register a new user with PayPal info
            const email = profile.email || `${profile.user_id}@paypal.user`;
            const username = profile.name || `paypal_user_${profile.user_id}`;

            // Generate a random password - user won't need to know it
            // as they'll log in via PayPal OAuth
            const password = crypto.randomBytes(16).toString('hex');
            
            const registerResult = await this.authService.register({
                email,
                username,
                password,
                oauth_provider: 'paypal',
                oauth_id: profile.user_id,
            });

            userId = registerResult.user.id;
        }        if (!userId) {
            throw new UnauthorizedException('User ID not found');
        }        // Create a payment method for the linked PayPal account
        // Extract clean email and name from PayPal profile
        const cleanEmail = profile.email || `${profile.user_id.split('/').pop()}@paypal.user`;
        const cleanName = profile.name || profile.given_name || profile.family_name || 'PayPal Account';
        
        const paymentMethodDetails = {
            email: cleanEmail,
            name: cleanName,
            user_id: profile.user_id.split('/').pop() || profile.user_id // Extract clean user ID
        };

        // Check if user already has a PayPal payment method
        const existingPaymentMethod = await this.prismaService.paymentMethod.findFirst({
            where: {
                user_id: userId,
                type: 'paypal',
            },
        });

        if (!existingPaymentMethod) {            // Create a new payment method
            await this.prismaService.paymentMethod.create({
                data: {
                    payment_method_id: uuidv4(),
                    user_id: userId,
                    type: 'paypal',
                    provider_token: tokenData.access_token,
                    details: JSON.stringify(paymentMethodDetails),
                    is_default: true, // Make it default if it's the first payment method
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            });
        } else {
            // Update existing payment method
            await this.prismaService.paymentMethod.update({
                where: { payment_method_id: existingPaymentMethod.payment_method_id },
                data: {
                    provider_token: tokenData.access_token,
                    details: JSON.stringify(paymentMethodDetails),
                    updated_at: new Date(),
                },
            });
        }

        // For new users, return auth token
        if (isNewUser) {
            const user = await this.prismaService.user.findUnique({
                where: { user_id: userId },
            });

            if (!user) {
                throw new NotFoundException('User not found');
            }

            const tokenResult = this.authService.generateToken(user);
            return {
                ...tokenResult,
                isNewUser: true,
                needsRoleSelection: !user.role,
                user
            };
        }

        // For existing users linking account, return success
        const user = await this.prismaService.user.findUnique({
            where: { user_id: userId },
        });

        return { 
            success: true, 
            isNewUser: false, 
            needsRoleSelection: false,
            user,
            linkedAccount: true
        };
    }

    private async exchangeCodeForTokens(code: string): Promise<any> {
        try {
            const tokenUrl = `${this.baseUrl}/v1/oauth2/token`;
            
            const data = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: this.redirectUri,
            });

            const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

            const response = await this.httpService.axiosRef.post(tokenUrl, data, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${credentials}`,
                },
            });

            this.logger.log('Successfully exchanged PayPal authorization code for tokens');
            return response.data;
        } catch (error) {
            this.logger.error('PayPal token exchange failed:', error.response?.data || error.message);
            throw new UnauthorizedException('Failed to exchange authorization code for tokens');
        }
    }

    private async getPayPalUserProfile(accessToken: string): Promise<any> {
        try {
            const profileUrl = `${this.baseUrl}/v1/identity/oauth2/userinfo?schema=paypalv1.1`;
            
            const response = await this.httpService.axiosRef.get(profileUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            this.logger.log('Successfully fetched PayPal user profile');
            return response.data;
        } catch (error) {
            this.logger.error('PayPal profile fetch failed:', error.response?.data || error.message);
            throw new UnauthorizedException('Failed to fetch PayPal user profile');
        }
    }

    // Payment processing methods (integrated from paypal.service)
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
        returnUrl: string,
        cancelUrl: string
    ): Promise<any> {
        try {
            const accessToken = await this.getAccessToken();
            
            // For Enterlist payments, artist pays Enterlist (enterlist@business.com)
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
                        email: 'enterlist@business.com' // Enterlist receives payment
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
            
            // Enterlist pays playlist makers when they withdraw
            const payoutData = {
                sender_batch_header: {
                    sender_batch_id: `batch_${Date.now()}`,
                    email_subject: 'Enterlist Payout - Withdrawal from your balance',
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
    }    // Enhanced method to get user's PayPal email from payment method
    async getUserPayPalEmail(userId: string): Promise<string> {
        const paymentMethod = await this.prismaService.paymentMethod.findFirst({
            where: {
                user_id: userId,
                type: 'paypal',
            },
        });

        if (!paymentMethod) {
            throw new NotFoundException('User does not have a linked PayPal account');
        }

        // Get email from payment method details
        try {
            const details = JSON.parse(paymentMethod.details);
            return details.email;
        } catch (error) {
            // If details parsing fails, try to get from PayPal API using stored token
            if (paymentMethod.provider_token) {
                try {
                    const profile = await this.getPayPalUserProfile(paymentMethod.provider_token);
                    return profile.email;
                } catch (tokenError) {
                    this.logger.error('Failed to get PayPal email from token:', tokenError);
                    throw new UnauthorizedException('PayPal account needs to be re-linked');
                }
            } else {
                throw new UnauthorizedException('PayPal account needs to be re-linked');
            }
        }
    }

    private async refreshAccessToken(refreshToken: string): Promise<any> {
        try {
            const tokenUrl = `${this.baseUrl}/v1/oauth2/token`;
            
            const data = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            });

            const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

            const response = await this.httpService.axiosRef.post(tokenUrl, data, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${credentials}`,
                },
            });

            return response.data;
        } catch (error) {
            this.logger.error('PayPal token refresh failed:', error.response?.data || error.message);
            throw new UnauthorizedException('Failed to refresh PayPal access token');
        }
    }

    private cleanupExpiredStates(): void {
        const now = new Date();
        for (const [state, data] of this.stateMap.entries()) {
            if (now > data.expiresAt) {
                this.stateMap.delete(state);
            }
        }
    }
}
