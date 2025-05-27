import { Injectable, UnauthorizedException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { LinkedAccountsService } from '../linked-accounts/linked-accounts.service';
import { CreateLinkedAccountDto } from '../linked-accounts/dto/linked-account.dto';
import * as crypto from 'crypto';

@Injectable()
export class PaypalAuthService {
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly redirectUri: string;
    private readonly environment: string;
    private readonly baseUrl: string;
    private readonly stateMap = new Map<string, { userId?: string; expiresAt: Date; isNewUser?: boolean }>();
    private readonly logger = new Logger(PaypalAuthService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
        private readonly linkedAccountsService: LinkedAccountsService,
        private readonly prismaService: PrismaService,
        private readonly authService: AuthService,
    ) {
        this.clientId = this.configService.get<string>('PAYPAL_CLIENT_ID') || '';
        this.clientSecret = this.configService.get<string>('PAYPAL_CLIENT_SECRET') || '';
        this.environment = this.configService.get<string>('PAYPAL_MODE', 'sandbox');
        this.baseUrl = this.environment === 'live' 
            ? 'https://api.paypal.com' 
            : 'https://api.sandbox.paypal.com';
        this.redirectUri = this.configService.get<string>('PAYPAL_REDIRECT_URI') || 
            `${this.configService.get<string>('BACKEND_URL')}/api/auth/paypal/callback`;

        if (!this.clientId || !this.clientSecret) {
            this.logger.warn('PayPal OAuth client ID or secret is missing');
        } else {
            this.logger.log(`PayPal OAuth service initialized in ${this.environment} mode`);
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
            'profile',
            'email',
            'https://uri.paypal.com/services/identity/activities'
        ].join(' ');

        const authUrl = new URL('https://www.paypal.com/signin/authorize');
        authUrl.searchParams.set('client_id', this.clientId);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', scopes);
        authUrl.searchParams.set('redirect_uri', this.redirectUri);
        authUrl.searchParams.set('state', state);

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
        const profile = await this.getPayPalUserProfile(tokenData.access_token);

        // Find PayPal platform in our database
        const paypalPlatform = await this.prismaService.platform.findFirst({
            where: { name: 'PayPal' },
        });

        if (!paypalPlatform) {
            throw new NotFoundException('PayPal platform not found in database');
        }

        // Calculate token expiration date
        const tokenExpiresAt = new Date();
        tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + tokenData.expires_in);

        // ALWAYS check if a user with this PayPal ID already exists (regardless of isNewUser flag)
        const existingOAuthUser = await this.prismaService.user.findFirst({
            where: {
                oauth_provider: 'paypal',
                oauth_id: profile.user_id,
            }
        });

        if (existingOAuthUser) {
            // User already exists with this OAuth account, log them in
            userId = existingOAuthUser.user_id;

            // Update or create linked account for this existing user
            const existingLinkedAccount = await this.prismaService.linkedAccount.findFirst({
                where: {
                    user_id: userId,
                    platform_id: paypalPlatform.platform_id,
                },
            });

            if (existingLinkedAccount) {
                // Update existing link
                await this.prismaService.linkedAccount.update({
                    where: { linked_account_id: existingLinkedAccount.linked_account_id },
                    data: {
                        access_token: tokenData.access_token,
                        refresh_token: tokenData.refresh_token,
                        token_expires_at: tokenExpiresAt,
                    },
                });
            } else {
                // Create new linked account
                const linkedAccountData: CreateLinkedAccountDto = {
                    user_id: userId,
                    platform_id: paypalPlatform.platform_id,
                    external_user_id: profile.user_id,
                    access_token: tokenData.access_token,
                    refresh_token: tokenData.refresh_token,
                    token_expires_at: tokenExpiresAt,
                };
                await this.linkedAccountsService.create(linkedAccountData);
            }

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
        }

        if (!userId) {
            throw new UnauthorizedException('User ID not found');
        }

        // Create or update linked account
        const linkedAccountData: CreateLinkedAccountDto = {
            user_id: userId,
            platform_id: paypalPlatform.platform_id,
            external_user_id: profile.user_id,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expires_at: tokenExpiresAt,
        };

        // Check if the user already has a linked PayPal account
        const existingAccount = await this.prismaService.linkedAccount.findFirst({
            where: {
                user_id: userId,
                platform_id: paypalPlatform.platform_id,
            },
        });

        if (existingAccount) {
            // Update existing link
            await this.prismaService.linkedAccount.update({
                where: { linked_account_id: existingAccount.linked_account_id },
                data: {
                    access_token: tokenData.access_token,
                    refresh_token: tokenData.refresh_token,
                    token_expires_at: tokenExpiresAt,
                },
            });
        } else {
            // Create new link
            await this.linkedAccountsService.create(linkedAccountData);
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
                needsRoleSelection: !user.role
            };
        }

        return { success: true, isNewUser: false, needsRoleSelection: false };
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

    private cleanupExpiredStates(): void {
        const now = new Date();
        for (const [state, data] of this.stateMap.entries()) {
            if (now > data.expiresAt) {
                this.stateMap.delete(state);
            }
        }
    }
}
