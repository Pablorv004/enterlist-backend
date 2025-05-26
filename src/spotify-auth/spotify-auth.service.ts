import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { LinkedAccountsService } from '../linked-accounts/linked-accounts.service';
import { CreateLinkedAccountDto } from '../linked-accounts/dto/linked-account.dto';
import { PrismaService } from '../prisma/prisma.service';
import { catchError, firstValueFrom, of } from 'rxjs';
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
    ) {
        this.clientId = this.configService.get<string>('SPOTIFY_CLIENT_ID') || 'test_client_id';
        console.log('Spotify Client ID:', this.clientId);
        this.clientSecret = this.configService.get<string>('SPOTIFY_CLIENT_SECRET') || 'test_client_secret';

        const apiBaseUrl = this.configService.get<string>('API_BASE_URL') || 'http://localhost:3000';
        this.redirectUri = `${apiBaseUrl}/api/auth/spotify/callback`;
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
        tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + tokenData.expires_in);        // If this is a new user registration (from register-or-login endpoint)
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
                // User already exists with this OAuth account, log them in
                const tokenResult = this.authService.generateToken(existingAccount.user);
                
                // Check if user has a role - if not, they need role selection
                const needsRoleSelection = !existingAccount.user.role;
                
                return {
                    ...tokenResult,
                    isNewUser: false,
                    needsRoleSelection
                };
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
                role: undefined, // No role set initially - user will select role
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
                isNewUser: true,
                needsRoleSelection: !user.role
            };
        }

        return { success: true, isNewUser: false, needsRoleSelection: false };
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
    }    // Get user playlists from Spotify
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
        }; try {
            const { data } = await firstValueFrom(
                this.httpService.get(`https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`, { headers }).pipe(
                    catchError(error => {
                        throw new BadRequestException(`Failed to fetch Spotify playlists: ${error.message}`);
                    }),
                ),
            );

            // Filter playlists to only show those owned by the user
            const ownedPlaylists = data.items.filter((playlist) => {
                return playlist.owner && playlist.owner.id === linkedAccount.external_user_id;
            });

            // For each owned playlist, get the tracks
            const playlistsWithTracks = await Promise.all(
                ownedPlaylists.map(async (playlist) => {
                    try {
                        const tracksResponse = await firstValueFrom(
                            this.httpService.get(
                                `https://api.spotify.com/v1/playlists/${playlist.id}/tracks?limit=50`,
                                { headers }
                            ).pipe(catchError(error => {
                                console.warn(`Failed to fetch tracks for playlist ${playlist.id}:`, error.message);
                                return of({ data: { items: [] } });
                            }),
                            ),
                        );

                        return {
                            ...playlist,
                            tracks: {
                                ...playlist.tracks,
                                items: tracksResponse.data.items
                            }
                        };
                    } catch (error) {
                        console.warn(`Error fetching tracks for playlist ${playlist.id}:`, error);
                        return playlist;
                    }
                })
            );

            return {
                ...data,
                items: playlistsWithTracks,
                total: ownedPlaylists.length // Update total to reflect filtered results
            };
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
    }    // Get user tracks from Spotify (for artists)
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

        // Get user profile to find artist ID
        const profile = await this.getSpotifyUserProfile(linkedAccount.access_token);

        const headers = {
            'Authorization': `Bearer ${linkedAccount.access_token}`,
        }; try {
            // First, try to get artist information
            let artistTracks: any[] = [];

            // Search for the user as an artist
            try {
                const searchResponse = await firstValueFrom(
                    this.httpService.get(
                        `https://api.spotify.com/v1/search?q=${encodeURIComponent(profile.display_name)}&type=artist&limit=1`,
                        { headers }
                    )
                );

                if (searchResponse.data.artists.items.length > 0) {
                    const artistId = searchResponse.data.artists.items[0].id;

                    // Get artist's albums
                    try {
                        const albumsResponse = await firstValueFrom(
                            this.httpService.get(
                                `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=${limit}&offset=${offset}`,
                                { headers }
                            )
                        );

                        // For each album, get the tracks
                        for (const album of albumsResponse.data.items) {
                            try {
                                const tracksResponse = await firstValueFrom(
                                    this.httpService.get(
                                        `https://api.spotify.com/v1/albums/${album.id}/tracks`,
                                        { headers }
                                    )
                                );

                                // Add album cover to each track
                                const tracksWithAlbum = tracksResponse.data.items.map((track: any) => ({
                                    ...track,
                                    album: {
                                        id: album.id,
                                        name: album.name,
                                        images: album.images,
                                        release_date: album.release_date
                                    }
                                }));

                                artistTracks = [...artistTracks, ...tracksWithAlbum];
                            } catch (error) {
                                console.warn(`Failed to fetch tracks for album ${album.id}:`, error.message);
                            }
                        }
                    } catch (error) {
                        console.warn('Failed to fetch artist albums:', error.message);
                    }
                }
            } catch (error) {
                console.warn('Failed to search for artist:', error.message);
            }

            // Also get saved tracks as fallback
            let savedTracks: any[] = [];
            try {
                const savedTracksResponse = await firstValueFrom(
                    this.httpService.get(`https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`, { headers })
                );
                savedTracks = savedTracksResponse.data.items || [];
            } catch (error) {
                console.warn('Failed to fetch saved tracks:', error.message);
            }

            return {
                artist_tracks: artistTracks,
                saved_tracks: savedTracks,
                artist_info: artistTracks.length > 0 ? { display_name: profile.display_name } : null
            };
        } catch (error) {
            throw new BadRequestException(`Failed to fetch tracks: ${error.message}`);
        }
    }    // Get tracks for a specific playlist from Spotify
    async getPlaylistTracks(playlistId: string, userId: string): Promise<any> {
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

        // Fetch playlist tracks from Spotify API with pagination
        const headers = {
            'Authorization': `Bearer ${linkedAccount.access_token}`,
        };

        try {
            let allTracks = [];
            let offset = 0;
            const limit = 50; // Spotify's maximum per request
            let hasMore = true;
            let totalCount = 0;

            // Fetch tracks in chunks to avoid response truncation
            while (hasMore && allTracks.length < 500) { // Limit to 500 tracks to prevent timeouts
                const { data } = await firstValueFrom(
                    this.httpService.get(
                        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`,
                        { headers }
                    ).pipe(
                        catchError(error => {
                            throw new BadRequestException(`Failed to fetch Spotify playlist tracks: ${error.message}`);
                        }),
                    ),
                );

                if (offset === 0) {
                    totalCount = data.total;
                }

                // Transform and add tracks
                const tracks = data.items
                    .filter((item: any) => item.track && item.track.id) // Filter out null tracks
                    .map((item: any) => ({
                        track_id: item.track.id,
                        title: item.track.name,
                        artist: item.track.artists.map((artist: any) => artist.name).join(', '),
                        album: item.track.album?.name,
                        duration_ms: item.track.duration_ms,
                        thumbnail_url: item.track.album?.images?.[0]?.url,
                        url: item.track.external_urls?.spotify,
                        platform_specific_id: item.track.id,
                        added_at: item.added_at,
                        preview_url: item.track.preview_url,
                        popularity: item.track.popularity,
                        explicit: item.track.explicit,
                        type: 'spotify'
                    }));

                allTracks = allTracks.concat(tracks);
                offset += limit;
                hasMore = data.next !== null && allTracks.length < data.total;

                // Add small delay to avoid rate limiting
                if (hasMore) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            return {
                tracks: allTracks,
                total: totalCount,
                fetched: allTracks.length,
                limit: limit,
                hasMore: allTracks.length < totalCount
            };
        } catch (error) {
            throw new BadRequestException(`Failed to fetch playlist tracks: ${error.message}`);
        }
    }    // Import playlists to the database
    async importPlaylistsToDatabase(userId: string, playlistIds: string[]): Promise<any> {
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

        const headers = {
            'Authorization': `Bearer ${linkedAccount.access_token}`,
        };

        const importedPlaylists: any[] = [];
        const skippedPlaylists: any[] = [];

        for (const playlistId of playlistIds) {
            try {
                // Fetch playlist details from Spotify
                const { data: playlistData } = await firstValueFrom(
                    this.httpService.get(
                        `https://api.spotify.com/v1/playlists/${playlistId}`,
                        { headers }
                    ).pipe(
                        catchError(error => {
                            throw new BadRequestException(`Failed to fetch Spotify playlist ${playlistId}: ${error.message}`);
                        }),
                    ),
                );

                // Check if playlist already exists
                const existingPlaylist = await this.prismaService.playlist.findFirst({
                    where: {
                        platform_id: spotifyPlatform.platform_id,
                        platform_specific_id: playlistId,
                    },
                });

                if (existingPlaylist) {
                    skippedPlaylists.push({
                        id: playlistId,
                        name: playlistData.name,
                        reason: 'Already exists'
                    });
                    continue;
                }

                // Create the playlist in the database
                const newPlaylist = await this.prismaService.playlist.create({
                    data: {
                        playlist_id: require('uuid').v4(),
                        creator_id: userId,
                        platform_id: spotifyPlatform.platform_id,
                        platform_specific_id: playlistId,
                        name: playlistData.name,
                        description: playlistData.description || null,
                        url: playlistData.external_urls?.spotify || null,
                        cover_image_url: playlistData.images?.[0]?.url || null, 
                        is_visible: true,
                        track_count: playlistData.tracks?.total || 0,
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
    }    // Import tracks to the database (as songs)
    async importTracksToDatabase(userId: string, trackIds: string[]): Promise<any> {
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

        const headers = {
            'Authorization': `Bearer ${linkedAccount.access_token}`,
        };

        const importedTracks: any[] = [];
        const skippedTracks: any[] = [];

        // Process tracks in chunks of 50 (Spotify API limit)
        const chunkSize = 50;
        for (let i = 0; i < trackIds.length; i += chunkSize) {
            const chunk = trackIds.slice(i, i + chunkSize);

            try {
                // Fetch track details from Spotify
                const { data: tracksData } = await firstValueFrom(
                    this.httpService.get(
                        `https://api.spotify.com/v1/tracks?ids=${chunk.join(',')}`,
                        { headers }
                    ).pipe(
                        catchError(error => {
                            throw new BadRequestException(`Failed to fetch Spotify tracks: ${error.message}`);
                        }),
                    ),
                );

                for (const track of tracksData.tracks) {
                    if (!track) continue; // Skip null tracks

                    try {
                        // Check if song already exists
                        const existingSong = await this.prismaService.song.findFirst({
                            where: {
                                platform_id: spotifyPlatform.platform_id,
                                platform_specific_id: track.id,
                            },
                        });

                        if (existingSong) {
                            skippedTracks.push({
                                id: track.id,
                                title: track.name,
                                reason: 'Already exists'
                            });
                            continue;
                        }

                        // Create the song in the database
                        const newSong = await this.prismaService.song.create({
                            data: {
                                song_id: require('uuid').v4(),
                                artist_id: userId, // The user importing becomes the artist
                                platform_id: spotifyPlatform.platform_id,
                                platform_specific_id: track.id,
                                title: track.name,
                                artist_name_on_platform: track.artists.map(artist => artist.name).join(', '),
                                album_name: track.album?.name || null,
                                url: track.external_urls?.spotify || null,
                                cover_image_url: track.album?.images?.[0]?.url || null,
                                duration_ms: track.duration_ms || null,
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

                        importedTracks.push(newSong);
                    } catch (error) {
                        console.error(`Failed to import track ${track.id}:`, error);
                        skippedTracks.push({
                            id: track.id,
                            title: track.name,
                            reason: 'Import failed'
                        });
                    }
                }
            } catch (error) {
                console.error(`Failed to fetch track chunk:`, error);
                chunk.forEach(trackId => {
                    skippedTracks.push({
                        id: trackId,
                        title: 'Unknown',
                        reason: 'Fetch failed'
                    });
                });
            }

            // Add small delay to avoid rate limiting
            if (i + chunkSize < trackIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return {
            imported: importedTracks,
            skipped: skippedTracks,
            message: `Successfully imported ${importedTracks.length} track(s). ${skippedTracks.length} track(s) were skipped.`
        };
    }
}
