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
export class SpotifyAuthService {
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
    ) {        this.clientId = this.configService.get<string>('SPOTIFY_CLIENT_ID') || '';
        this.clientSecret = this.configService.get<string>('SPOTIFY_CLIENT_SECRET') || '';

        // Get the frontend URL from config to ensure proper redirection after OAuth
        const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
        
        // We redirect back to the frontend with the proper OAuth parameters
        this.redirectUri = `${frontendUrl}/oauth-callback?platform=spotify`;
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
            'user-read-private',
            'user-read-email',
            'playlist-read-private',
            'playlist-read-collaborative',
            'user-library-read'
        ].join(' ');

        // Construct the Spotify authorization URL
        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: this.redirectUri,
            state,
            scope,
        });

        return `https://accounts.spotify.com/authorize?${params.toString()}`;
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

        // Get user profile from Spotify
        const profile = await this.getSpotifyUserProfile(tokenData.access_token);

        // Find Spotify platform in our database
        const spotifyPlatform = await this.prismaService.platform.findFirst({
            where: { name: 'Spotify' },
        });

        if (!spotifyPlatform) {
            throw new NotFoundException('Spotify platform not found in database');
        }

        // Calculate token expiration date
        const tokenExpiresAt = new Date();
        tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + tokenData.expires_in);

        // If this is a new user registration (from register-or-login endpoint)
        if (isNewUser) {
            // Check if a user with this Spotify ID already exists
            const existingAccount = await this.prismaService.linkedAccount.findFirst({
                where: {
                    platform_id: spotifyPlatform.platform_id,
                    external_user_id: profile.id,
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

            // Register a new user with Spotify info
            const email = profile.email || `${profile.id}@spotify.user`;
            const username = profile.display_name || `spotify_user_${profile.id}`;
            
            // Generate a random password - user won't need to know it
            // as they'll log in via Spotify OAuth
            const password = crypto.randomBytes(16).toString('hex');
            
            const registerResult = await this.authService.register({
                email,
                username,
                password,
                role: user_role.artist, // Default role for Spotify users
                oauth_provider: 'spotify',
                oauth_id: profile.id,
            });
            
            userId = registerResult.user.id;
        }
        
        if (!userId) {
            throw new UnauthorizedException('User ID not found');
        }

        // Create or update linked account
        const linkedAccountData: CreateLinkedAccountDto = {
            user_id: userId,
            platform_id: spotifyPlatform.platform_id,
            external_user_id: profile.id,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expires_at: tokenExpiresAt,
        };

        // Check if the user already has a linked Spotify account
        const existingAccount = await this.prismaService.linkedAccount.findFirst({
            where: {
                user_id: userId,
                platform_id: spotifyPlatform.platform_id,
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
        }        // For new users, return auth token
        if (isNewUser) {
            const user = await this.prismaService.user.findUnique({
                where: { user_id: userId },
            });
            
            if (!user) {
                throw new NotFoundException('User not found');
            }
            
            return this.authService.generateToken(user);
        }

        return { success: true };
    }

    private async exchangeCodeForTokens(code: string): Promise<any> {
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: this.redirectUri,
        });

        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
        };

        try {
            const { data } = await firstValueFrom(
                this.httpService.post('https://accounts.spotify.com/api/token', params.toString(), { headers }).pipe(
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

    private async getSpotifyUserProfile(accessToken: string): Promise<any> {
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
        };

        try {
            const { data } = await firstValueFrom(
                this.httpService.get('https://api.spotify.com/v1/me', { headers }).pipe(
                    catchError(error => {
                        throw new BadRequestException(`Failed to fetch Spotify user profile: ${error.message}`);
                    }),
                ),
            );

            return data;
        } catch (error) {
            throw new BadRequestException(`Profile fetch failed: ${error.message}`);
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

    // Get user playlists from Spotify
    async getUserPlaylists(userId: string, limit = 50, offset = 0): Promise<any> {
        // Find the Spotify platform
        const spotifyPlatform = await this.prismaService.platform.findFirst({
            where: { name: 'Spotify' },
        });

        if (!spotifyPlatform) {
            throw new NotFoundException('Spotify platform not found in database');
        }

        // Find the user's linked Spotify account
        const linkedAccount = await this.prismaService.linkedAccount.findFirst({
            where: {
                user_id: userId,
                platform_id: spotifyPlatform.platform_id,
            },
        });

        if (!linkedAccount) {
            throw new NotFoundException('Spotify account not linked for this user');
        }

        // Check if token is expired and refresh if needed
        if (linkedAccount.token_expires_at && linkedAccount.token_expires_at < new Date()) {
            const refreshedAccount = await this.refreshAccessToken(userId, spotifyPlatform.platform_id);
            linkedAccount.access_token = refreshedAccount.access_token;
        }

        // Fetch playlists from Spotify API
        const headers = {
            'Authorization': `Bearer ${linkedAccount.access_token}`,
        };

        try {
            const { data } = await firstValueFrom(
                this.httpService.get(`https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`, { headers }).pipe(
                    catchError(error => {
                        throw new BadRequestException(`Failed to fetch Spotify playlists: ${error.message}`);
                    }),
                ),
            );

            return data;
        } catch (error) {
            throw new BadRequestException(`Failed to fetch playlists: ${error.message}`);
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

        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
        };

        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: linkedAccount.refresh_token,
        });

        try {
            const { data } = await firstValueFrom(
                this.httpService.post('https://accounts.spotify.com/api/token', params.toString(), { headers }).pipe(
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

    // Get user tracks from Spotify
    async getUserTracks(userId: string, limit = 50, offset = 0): Promise<any> {
        // Find the Spotify platform
        const spotifyPlatform = await this.prismaService.platform.findFirst({
            where: { name: 'Spotify' },
        });

        if (!spotifyPlatform) {
            throw new NotFoundException('Spotify platform not found in database');
        }

        // Find the user's linked Spotify account
        const linkedAccount = await this.prismaService.linkedAccount.findFirst({
            where: {
                user_id: userId,
                platform_id: spotifyPlatform.platform_id,
            },
        });

        if (!linkedAccount) {
            throw new NotFoundException('Spotify account not linked for this user');
        }

        // Check if token is expired and refresh if needed
        if (linkedAccount.token_expires_at && linkedAccount.token_expires_at < new Date()) {
            const refreshedAccount = await this.refreshAccessToken(userId, spotifyPlatform.platform_id);
            linkedAccount.access_token = refreshedAccount.access_token;
        }

        // Fetch tracks from Spotify API
        const headers = {
            'Authorization': `Bearer ${linkedAccount.access_token}`,
        };

        try {
            // First fetch user's saved tracks
            const savedTracksResponse = await firstValueFrom(
                this.httpService.get(`https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`, { headers }).pipe(
                    catchError(error => {
                        throw new BadRequestException(`Failed to fetch Spotify saved tracks: ${error.message}`);
                    }),
                ),
            );
            
            // Then check if user is an artist and fetch their tracks
            try {
                const artistResponse = await firstValueFrom(
                    this.httpService.get('https://api.spotify.com/v1/me/albums', { headers }).pipe(
                            catchError(() => {
                                // Not an artist or no albums, just return saved tracks
                                return savedTracksResponse.data ? [savedTracksResponse] : [];
                            }),
                        ),
                );
                
                // Combine saved tracks with artist tracks if both are available
                return {
                    saved_tracks: savedTracksResponse.data,
                    artist_albums: artistResponse.data
                };
            } catch (artistError) {
                // If error fetching artist data, just return saved tracks
                return savedTracksResponse.data;
            }
        } catch (error) {
            throw new BadRequestException(`Failed to fetch tracks: ${error.message}`);
        }
    }
}
