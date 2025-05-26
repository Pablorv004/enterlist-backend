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
    private readonly apiKey: string;
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
        this.apiKey = this.configService.get<string>('YOUTUBE_API_KEY') || 'test_api_key';

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
        }        // Calculate token expiration date
        const tokenExpiresAt = new Date();
        tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + tokenData.expires_in);
        
        // ALWAYS check if a user with this YouTube ID already exists (regardless of isNewUser flag)
        const existingOAuthUser = await this.prismaService.user.findFirst({
            where: {
                oauth_provider: 'youtube',
                oauth_id: youtubeId,
            }
        });

        if (existingOAuthUser) {
            // User already exists with this OAuth account, log them in
            userId = existingOAuthUser.user_id;
            
            // Update or create linked account for this existing user
            const existingLinkedAccount = await this.prismaService.linkedAccount.findFirst({
                where: {
                    user_id: userId,
                    platform_id: youtubePlatform.platform_id,
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
                    platform_id: youtubePlatform.platform_id,
                    external_user_id: youtubeId,
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
        }        // For new users, return auth token
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
        };        try {
            const params = new URLSearchParams({
                part: 'snippet,contentDetails,statistics',
                mine: 'true',
                key: this.apiKey
            });

            const headers = {
                'Authorization': `Bearer ${linkedAccount.access_token}`,
            };

            const { data } = await firstValueFrom(
                this.httpService.get(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`, { headers }).pipe(
                    catchError(error => {
                        throw new BadRequestException(`Failed to fetch YouTube channels: ${error.response?.data?.error?.message || error.message}`);
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
        };        try {
            const params = new URLSearchParams({
                part: 'snippet,contentDetails',
                mine: 'true',
                maxResults: limit.toString(),
                key: this.apiKey
            });

            if (offset > 0) {
                params.append('pageToken', offset.toString());
            }

            const headers = {
                'Authorization': `Bearer ${linkedAccount.access_token}`,
            };

            const { data } = await firstValueFrom(
                this.httpService.get(
                    `https://www.googleapis.com/youtube/v3/playlists?${params.toString()}`,
                    { headers }
                ).pipe(
                    catchError(error => {
                        throw new BadRequestException(`Failed to fetch YouTube playlists: ${error.response?.data?.error?.message || error.message}`);
                    }),
                ),
            );

            return data;
        } catch (error) {
            throw new BadRequestException(`Failed to fetch playlists: ${error.message}`);
        }
    }    // Get user videos from YouTube
    async getUserVideos(userId: string, limit = 50, offset = 0, musicOnly = false): Promise<any> {
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

            // If musicOnly is true, filter videos by music category
            if (musicOnly && data.items && data.items.length > 0) {
                const videoIds = data.items.map((item: any) => item.id.videoId).join(',');
                
                try {                    const videoDetailsResponse = await firstValueFrom(
                        this.httpService.get(
                            `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds}`,
                            { headers }
                        ).pipe(
                            catchError(error => {
                                console.warn('Failed to fetch video details for music filtering:', error.message);
                                throw new BadRequestException(`Failed to fetch video details: ${error.message}`);
                            }),
                        ),
                    );

                    // Filter videos that are in the Music category (categoryId: "10")
                    const musicVideoIds = new Set(
                        videoDetailsResponse.data.items
                            .filter((video: any) => video.snippet.categoryId === "10")
                            .map((video: any) => video.id)
                    );

                    // Filter original results to only include music videos
                    data.items = data.items.filter((item: any) => musicVideoIds.has(item.id.videoId));
                } catch (error) {
                    console.warn('Error filtering videos by music category:', error.message);
                    // If filtering fails, return all videos
                }
            }

            return data;
        } catch (error) {
            throw new BadRequestException(`Failed to fetch videos: ${error.message}`);
        }
    }

    // Get user songs (music videos) from YouTube
    async getUserSongs(userId: string, limit = 50, offset = 0): Promise<any> {
        return this.getUserVideos(userId, limit, offset, true);
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
    }    // Get tracks for a specific playlist from YouTube
    async getPlaylistTracks(playlistId: string, userId: string): Promise<any> {
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

        try {
            let allTracks = [];
            let nextPageToken = '';
            const maxResults = 50;
            let totalCount = 0;
            let pageCount = 0;
            const maxPages = 10; // Limit to prevent infinite loops

            // Fetch playlist items in chunks with pagination
            do {
                // Use API key in addition to OAuth token for better reliability
                const params = new URLSearchParams({
                    part: 'snippet,contentDetails',
                    playlistId: playlistId,
                    maxResults: maxResults.toString(),
                    key: this.apiKey
                });

                if (nextPageToken) {
                    params.append('pageToken', nextPageToken);
                }

                const headers = {
                    'Authorization': `Bearer ${linkedAccount.access_token}`,
                };

                const { data } = await firstValueFrom(
                    this.httpService.get(
                        `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`,
                        { headers }
                    ).pipe(
                        catchError(error => {
                            // If OAuth fails, try with API key only for public playlists
                            if (error.response?.status === 403 || error.response?.status === 401) {
                                console.warn('OAuth failed, trying with API key only for public playlist');
                                return this.httpService.get(
                                    `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`
                                ).pipe(
                                    catchError(apiKeyError => {
                                        throw new BadRequestException(`Failed to fetch YouTube playlist tracks: ${apiKeyError.response?.data?.error?.message || apiKeyError.message}`);
                                    })
                                );
                            }
                            throw new BadRequestException(`Failed to fetch YouTube playlist tracks: ${error.response?.data?.error?.message || error.message}`);
                        }),
                    ),
                );

                if (pageCount === 0) {
                    totalCount = data.pageInfo?.totalResults || 0;
                }

                // Transform the data to include additional track information
                const tracks = (data.items || [])
                    .filter((item: any) => item.contentDetails?.videoId) // Filter out unavailable videos
                    .map((item: any) => ({
                        track_id: item.contentDetails.videoId,
                        title: item.snippet.title,
                        artist: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle,
                        duration_ms: null, // YouTube API requires separate call for duration
                        thumbnail_url: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
                        url: `https://www.youtube.com/watch?v=${item.contentDetails.videoId}`,
                        platform_specific_id: item.contentDetails.videoId,
                        added_at: item.snippet.publishedAt,
                        description: item.snippet.description?.substring(0, 200), // Limit description length
                        position: item.snippet.position,
                        type: 'youtube'
                    }));

                allTracks = allTracks.concat(tracks);
                nextPageToken = data.nextPageToken || '';
                pageCount++;
                
                // Add small delay to avoid rate limiting
                if (nextPageToken && pageCount < maxPages) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

            } while (nextPageToken && pageCount < maxPages && allTracks.length < 500);

            return {
                tracks: allTracks,
                total: totalCount,
                fetched: allTracks.length,
                hasMore: !!nextPageToken && allTracks.length < totalCount,
                nextPageToken: nextPageToken
            };
        } catch (error) {
            throw new BadRequestException(`Failed to fetch playlist tracks: ${error.message}`);
        }
    }

    // Import playlists to the database
    async importPlaylistsToDatabase(userId: string, playlistIds: string[]): Promise<any> {
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

        const headers = {
            'Authorization': `Bearer ${linkedAccount.access_token}`,
        };

        const importedPlaylists: any[] = [];
        const skippedPlaylists: any[] = [];

        for (const playlistId of playlistIds) {
            try {
                // Fetch playlist details from YouTube
                const params = new URLSearchParams({
                    part: 'snippet,contentDetails',
                    id: playlistId,
                    key: this.apiKey
                });

                const { data: playlistData } = await firstValueFrom(
                    this.httpService.get(
                        `https://www.googleapis.com/youtube/v3/playlists?${params.toString()}`,
                        { headers }
                    ).pipe(
                        catchError(error => {
                            throw new BadRequestException(`Failed to fetch YouTube playlist ${playlistId}: ${error.message}`);
                        }),
                    ),
                );

                if (!playlistData.items || playlistData.items.length === 0) {
                    skippedPlaylists.push({
                        id: playlistId,
                        name: 'Unknown',
                        reason: 'Playlist not found'
                    });
                    continue;
                }

                const playlist = playlistData.items[0];

                // Check if playlist already exists
                const existingPlaylist = await this.prismaService.playlist.findFirst({
                    where: {
                        platform_id: youtubePlatform.platform_id,
                        platform_specific_id: playlistId,
                    },
                });

                if (existingPlaylist) {
                    skippedPlaylists.push({
                        id: playlistId,
                        name: playlist.snippet.title,
                        reason: 'Already exists'
                    });
                    continue;
                }

                // Create the playlist in the database
                const newPlaylist = await this.prismaService.playlist.create({
                    data: {
                        playlist_id: require('uuid').v4(),
                        creator_id: userId,
                        platform_id: youtubePlatform.platform_id,
                        platform_specific_id: playlistId,
                        name: playlist.snippet.title,
                        description: playlist.snippet.description || null,
                        url: `https://www.youtube.com/playlist?list=${playlistId}`,
                        cover_image_url: playlist.snippet.thumbnails?.medium?.url ||                        playlist.snippet.thumbnails?.default?.url || null,
                        is_visible: true,
                        track_count: playlist.contentDetails.itemCount || 0,
                        genre: null,
                        submission_fee: 0,
                        created_at: new Date(),
                        updated_at: new Date(),
                    },
                    include: {
                        creator: {
                            select: {
                                username: true,
                                email: true,
                            },
                        },
                        platform: true,
                    },
                });

                importedPlaylists.push(newPlaylist);
            } catch (error) {
                console.error(`Failed to import playlist ${playlistId}:`, error);
                skippedPlaylists.push({
                    id: playlistId,
                    name: 'Unknown',
                    reason: 'Import failed'
                });
            }
        }

        return {
            imported: importedPlaylists,
            skipped: skippedPlaylists,
            message: `Successfully imported ${importedPlaylists.length} playlist(s). ${skippedPlaylists.length} playlist(s) were skipped.`
        };
    }

    // Import videos to the database (as songs)
    async importVideosToDatabase(userId: string, videoIds: string[]): Promise<any> {
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

        const headers = {
            'Authorization': `Bearer ${linkedAccount.access_token}`,
        };

        const importedVideos: any[] = [];
        const skippedVideos: any[] = [];

        // Process videos in chunks of 50 (YouTube API limit)
        const chunkSize = 50;
        for (let i = 0; i < videoIds.length; i += chunkSize) {
            const chunk = videoIds.slice(i, i + chunkSize);
            
            try {
                // Fetch video details from YouTube
                const params = new URLSearchParams({
                    part: 'snippet,contentDetails',
                    id: chunk.join(','),
                    key: this.apiKey
                });

                const { data: videosData } = await firstValueFrom(
                    this.httpService.get(
                        `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
                        { headers }
                    ).pipe(
                        catchError(error => {
                            throw new BadRequestException(`Failed to fetch YouTube videos: ${error.message}`);
                        }),
                    ),
                );

                for (const video of videosData.items || []) {
                    if (!video) continue; // Skip null videos

                    try {
                        // Check if song already exists
                        const existingSong = await this.prismaService.song.findFirst({
                            where: {
                                platform_id: youtubePlatform.platform_id,
                                platform_specific_id: video.id,
                            },
                        });

                        if (existingSong) {
                            skippedVideos.push({
                                id: video.id,
                                title: video.snippet.title,
                                reason: 'Already exists'
                            });
                            continue;
                        }                        // Parse duration from ISO 8601 format (PT1M23S -> 83 seconds)
                        let durationMs: number | null = null;
                        if (video.contentDetails?.duration) {
                            const duration = video.contentDetails.duration;
                            const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                            if (match) {
                                const hours = parseInt(match[1] || '0');
                                const minutes = parseInt(match[2] || '0');
                                const seconds = parseInt(match[3] || '0');
                                durationMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
                            }
                        }

                        // Create the song in the database
                        const newSong = await this.prismaService.song.create({
                            data: {
                                song_id: require('uuid').v4(),
                                artist_id: userId, // The user importing becomes the artist
                                platform_id: youtubePlatform.platform_id,
                                platform_specific_id: video.id,
                                title: video.snippet.title,
                                artist_name_on_platform: video.snippet.channelTitle,
                                album_name: null,
                                url: `https://www.youtube.com/watch?v=${video.id}`,
                                cover_image_url: video.snippet.thumbnails?.medium?.url || 
                                               video.snippet.thumbnails?.default?.url || null,
                                duration_ms: durationMs,
                                is_visible: true,
                                created_at: new Date(),
                                updated_at: new Date(),
                            },
                            include: {
                                artist: {
                                    select: {
                                        username: true,
                                        email: true,
                                    },
                                },
                                platform: true,
                            },
                        });

                        importedVideos.push(newSong);
                    } catch (error) {
                        console.error(`Failed to import video ${video.id}:`, error);
                        skippedVideos.push({
                            id: video.id,
                            title: video.snippet?.title || 'Unknown',
                            reason: 'Import failed'
                        });
                    }
                }
            } catch (error) {
                console.error(`Failed to fetch video chunk:`, error);
                chunk.forEach(videoId => {
                    skippedVideos.push({
                        id: videoId,
                        title: 'Unknown',
                        reason: 'Fetch failed'
                    });
                });
            }

            // Add small delay to avoid rate limiting
            if (i + chunkSize < videoIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return {
            imported: importedVideos,
            skipped: skippedVideos,
            message: `Successfully imported ${importedVideos.length} video(s). ${skippedVideos.length} video(s) were skipped.`
        };
    }
}
