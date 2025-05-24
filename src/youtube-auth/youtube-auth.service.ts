import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { LinkedAccountsService } from '../linked-accounts/linked-accounts.service';
import { CreateLinkedAccountDto } from '../linked-accounts/dto/linked-account.dto';
import { PrismaService } from '../prisma/prisma.service';
import { catchError, firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/auth.service';
import { user_role } from '@prisma/client';

@Injectable()
export class YoutubeAuthService {
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly redirectUri: string;
    private readonly stateMap = new Map<string, { userId?: string; expiresAt: Date; isNewUser?: boolean }>();

    constructor(
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
        private readonly linkedAccountsService: LinkedAccountsService,
        private readonly prismaService: PrismaService,
        private readonly authService: AuthService,
    ) {
        this.clientId = this.configService.get<string>('YOUTUBE_CLIENT_ID') || 'test_client_id';
        this.clientSecret = this.configService.get<string>('YOUTUBE_CLIENT_SECRET') || 'test_client_secret';

        // In production, this would come from environment variables or config
        const apiBaseUrl = this.configService.get<string>('API_BASE_URL') || 'http://localhost:3000';
        this.redirectUri = `${apiBaseUrl}/api/auth/youtube/callback`;
    }

    async getAuthorizationUrl(userId?: string): Promise<string> {
        // Generate a random state parameter to prevent CSRF
        const state = crypto.randomBytes(16).toString('hex');

        // Store the state with user ID and expiry (10 minutes)
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

        // If userId is provided, this is for linking to existing account
        // If not, this is for registration/login flow
        this.stateMap.set(state, { 
            userId, 
            expiresAt,
            isNewUser: !userId
        });

        // Clean up expired states
        this.cleanExpiredStates();

        const scope = [
            'https://www.googleapis.com/auth/youtube.readonly',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile'
        ].join(' ');

        // Construct the YouTube/Google authorization URL
        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: this.redirectUri,
            state,
            scope,
            access_type: 'offline',
            prompt: 'consent'
        });

        return `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
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

        // Get user profile from Google
        const profile = await this.getUserProfile(tokenData.access_token);
        
        // Get YouTube channel info
        const channelInfo = await this.getYouTubeChannelInfo(tokenData.access_token);
        const youtubeId = channelInfo?.items?.[0]?.id || profile.id;

        // Find YouTube platform in our database
        const youtubePlatform = await this.prismaService.platform.findFirst({
            where: { name: 'YouTube' },
        });

        if (!youtubePlatform) {
            throw new NotFoundException('YouTube platform not found in database');
        }

        // Calculate token expiration date
        const tokenExpiresAt = new Date();
        tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + tokenData.expires_in);

        // If this is a new user registration (from register-or-login endpoint)
        if (isNewUser) {
            // Check if a user with this YouTube ID already exists
            const existingAccount = await this.prismaService.linkedAccount.findFirst({
                where: {
                    platform_id: youtubePlatform.platform_id,
                    external_user_id: youtubeId,
                },
                include: {
                    user: true,
                },
            });

            if (existingAccount) {
                // User already exists, just return their account
                userId = existingAccount.user_id;
                return this.authService.generateToken(existingAccount.user);
            }

            // Register a new user with YouTube info
            const email = profile.email || `${youtubeId}@youtube.user`;
            const username = profile.name || channelInfo?.items?.[0]?.snippet?.title || `youtube_user_${youtubeId}`;
            
            // Generate a random password - user won't need to know it
            // as they'll log in via YouTube OAuth
            const password = crypto.randomBytes(16).toString('hex');
            
            const registerResult = await this.authService.register({
                email,
                username,
                password,
                role: user_role.artist, // Default role for YouTube users
                oauth_provider: 'youtube',
                oauth_id: youtubeId,
            });
            
            userId = registerResult.user.id;
        }
        
        if (!userId) {
            throw new UnauthorizedException('User ID not found');
        }

        // Create or update linked account
        const linkedAccountData: CreateLinkedAccountDto = {
            user_id: userId,
            platform_id: youtubePlatform.platform_id,
            external_user_id: youtubeId,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expires_at: tokenExpiresAt,
        };

        // Check if the user already has a linked YouTube account
        const existingAccount = await this.prismaService.linkedAccount.findFirst({
            where: {
                user_id: userId,
                platform_id: youtubePlatform.platform_id,
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
        }        // For new users, return auth token with isNewUser flag
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
                isNewUser: true
            };
        }

        return { success: true, isNewUser: false };
    }

    private async exchangeCodeForTokens(code: string): Promise<any> {
        const params = new URLSearchParams({
            code,
            client_id: this.clientId,
            client_secret: this.clientSecret,
            redirect_uri: this.redirectUri,
            grant_type: 'authorization_code',
        });

        try {
            const { data } = await firstValueFrom(
                this.httpService.post('https://oauth2.googleapis.com/token', params.toString(), {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }).pipe(
                    catchError(error => {
                        throw new BadRequestException(`Failed to exchange code for tokens: ${error.message}`);
                    }),
                ),
            );

            return data;
        } catch (error) {
            throw new BadRequestException(`Token exchange failed: ${error.message}`);
        }
    }

    private async getUserProfile(accessToken: string): Promise<any> {
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
        };

        try {
            const { data } = await firstValueFrom(
                this.httpService.get('https://www.googleapis.com/oauth2/v2/userinfo', { headers }).pipe(
                    catchError(error => {
                        throw new BadRequestException(`Failed to fetch Google user profile: ${error.message}`);
                    }),
                ),
            );

            return data;
        } catch (error) {
            throw new BadRequestException(`Profile fetch failed: ${error.message}`);
        }
    }

    private async getYouTubeChannelInfo(accessToken: string): Promise<any> {
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
        };

        try {
            const { data } = await firstValueFrom(
                this.httpService.get('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers }).pipe(
                    catchError(error => {
                        // This might fail if the user doesn't have a YouTube channel
                        return [];
                    }),
                ),
            );

            return data;
        } catch (error) {
            // Just return empty if failed to fetch channel info
            return { items: [] };
        }
    }
    
    private cleanExpiredStates(): void {
        const now = new Date();
        for (const [key, value] of this.stateMap.entries()) {
            if (value.expiresAt < now) {
                this.stateMap.delete(key);
            }
        }
    }

    // Get user channels from YouTube
    async getUserChannels(userId: string, limit = 50, offset = 0): Promise<any> {
        // Find the YouTube platform
        const youtubePlatform = await this.prismaService.platform.findFirst({
            where: { name: 'YouTube' },
        });

        if (!youtubePlatform) {
            throw new NotFoundException('YouTube platform not found in database');
        }

        // Find the user's linked YouTube account
        const linkedAccount = await this.prismaService.linkedAccount.findFirst({
            where: {
                user_id: userId,
                platform_id: youtubePlatform.platform_id,
            },
        });

        if (!linkedAccount) {
            throw new NotFoundException('YouTube account not linked for this user');
        }

        // Check if token is expired and refresh if needed
        if (linkedAccount.token_expires_at && linkedAccount.token_expires_at < new Date()) {
            const refreshedAccount = await this.refreshAccessToken(userId, youtubePlatform.platform_id);
            linkedAccount.access_token = refreshedAccount.access_token;
        }

        // Fetch channels from YouTube API
        const headers = {
            'Authorization': `Bearer ${linkedAccount.access_token}`,
        };

        try {
            const { data } = await firstValueFrom(
                this.httpService.get(`https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true`, { headers }).pipe(
                    catchError(error => {
                        throw new BadRequestException(`Failed to fetch YouTube channels: ${error.message}`);
                    }),
                ),
            );

            return data;
        } catch (error) {
            throw new BadRequestException(`Failed to fetch channels: ${error.message}`);
        }
    }

    // Get user playlists from YouTube
    async getUserPlaylists(userId: string, limit = 50, offset = 0): Promise<any> {
        // Find the YouTube platform
        const youtubePlatform = await this.prismaService.platform.findFirst({
            where: { name: 'YouTube' },
        });

        if (!youtubePlatform) {
            throw new NotFoundException('YouTube platform not found in database');
        }

        // Find the user's linked YouTube account
        const linkedAccount = await this.prismaService.linkedAccount.findFirst({
            where: {
                user_id: userId,
                platform_id: youtubePlatform.platform_id,
            },
        });

        if (!linkedAccount) {
            throw new NotFoundException('YouTube account not linked for this user');
        }

        // Check if token is expired and refresh if needed
        if (linkedAccount.token_expires_at && linkedAccount.token_expires_at < new Date()) {
            const refreshedAccount = await this.refreshAccessToken(userId, youtubePlatform.platform_id);
            linkedAccount.access_token = refreshedAccount.access_token;
        }

        // Fetch playlists from YouTube API
        const headers = {
            'Authorization': `Bearer ${linkedAccount.access_token}`,
        };

        try {
            const { data } = await firstValueFrom(
                this.httpService.get(
                    `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=${limit}&pageToken=${offset > 0 ? offset : ''}`,
                    { headers }
                ).pipe(
                    catchError(error => {
                        throw new BadRequestException(`Failed to fetch YouTube playlists: ${error.message}`);
                    }),
                ),
            );

            return data;
        } catch (error) {
            throw new BadRequestException(`Failed to fetch playlists: ${error.message}`);
        }
    }

    // Get user videos from YouTube
    async getUserVideos(userId: string, limit = 50, offset = 0): Promise<any> {
        // Find the YouTube platform
        const youtubePlatform = await this.prismaService.platform.findFirst({
            where: { name: 'YouTube' },
        });

        if (!youtubePlatform) {
            throw new NotFoundException('YouTube platform not found in database');
        }

        // Find the user's linked YouTube account
        const linkedAccount = await this.prismaService.linkedAccount.findFirst({
            where: {
                user_id: userId,
                platform_id: youtubePlatform.platform_id,
            },
        });

        if (!linkedAccount) {
            throw new NotFoundException('YouTube account not linked for this user');
        }

        // Check if token is expired and refresh if needed
        if (linkedAccount.token_expires_at && linkedAccount.token_expires_at < new Date()) {
            const refreshedAccount = await this.refreshAccessToken(userId, youtubePlatform.platform_id);
            linkedAccount.access_token = refreshedAccount.access_token;
        }

        // First, get the user's channel ID
        const channelsResponse = await this.getUserChannels(userId);
        
        if (!channelsResponse.items || channelsResponse.items.length === 0) {
            throw new BadRequestException('No YouTube channels found for this user');
        }
        
        const channelId = channelsResponse.items[0].id;

        // Fetch videos from YouTube API
        const headers = {
            'Authorization': `Bearer ${linkedAccount.access_token}`,
        };

        try {
            const { data } = await firstValueFrom(
                this.httpService.get(
                    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=${limit}&type=video&order=date&pageToken=${offset > 0 ? offset : ''}`,
                    { headers }
                ).pipe(
                    catchError(error => {
                        throw new BadRequestException(`Failed to fetch YouTube videos: ${error.message}`);
                    }),
                ),
            );

            return data;
        } catch (error) {
            throw new BadRequestException(`Failed to fetch videos: ${error.message}`);
        }
    }

    // Method to refresh an access token when it expires
    async refreshAccessToken(userId: string, platformId: number): Promise<any> {
        // Find the linked account
        const linkedAccount = await this.prismaService.linkedAccount.findFirst({
            where: {
                user_id: userId,
                platform_id: platformId,
            },
        });

        if (!linkedAccount || !linkedAccount.refresh_token) {
            throw new NotFoundException('Linked account or refresh token not found');
        }

        const params = new URLSearchParams({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            refresh_token: linkedAccount.refresh_token,
            grant_type: 'refresh_token',
        });

        try {
            const { data } = await firstValueFrom(
                this.httpService.post('https://oauth2.googleapis.com/token', params.toString(), {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }).pipe(
                    catchError(error => {
                        throw new BadRequestException(`Failed to refresh token: ${error.message}`);
                    }),
                ),
            );

            // Calculate new expiration time
            const tokenExpiresAt = new Date();
            tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + data.expires_in);

            // Update the linked account
            return this.prismaService.linkedAccount.update({
                where: { linked_account_id: linkedAccount.linked_account_id },
                data: {
                    access_token: data.access_token,
                    token_expires_at: tokenExpiresAt,
                    // Some oauth providers might send a new refresh token
                    refresh_token: data.refresh_token || linkedAccount.refresh_token,
                },
            });
        } catch (error) {
            throw new BadRequestException(`Token refresh failed: ${error.message}`);
        }
    }
}
