import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { LinkedAccountsService } from '../linked-accounts/linked-accounts.service';
import { CreateLinkedAccountDto } from '../linked-accounts/dto/linked-account.dto';
import { PrismaService } from '../prisma/prisma.service';
import { catchError, firstValueFrom, of } from 'rxjs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/auth.service';
@Injectable()
export class SpotifyAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly mobileRedirectUri: string;
  private readonly stateMap = new Map<
    string,
    { userId?: string; expiresAt: Date; isNewUser?: boolean; isMobile?: boolean }
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly linkedAccountsService: LinkedAccountsService,
    private readonly prismaService: PrismaService,
    private readonly authService: AuthService,
  ) {
    this.clientId =
      this.configService.get<string>('SPOTIFY_CLIENT_ID') || 'test_client_id';
    console.log('Spotify Client ID:', this.clientId);
    this.clientSecret =
      this.configService.get<string>('SPOTIFY_CLIENT_SECRET') ||
      'test_client_secret';

    const apiBaseUrl =
      this.configService.get<string>('API_BASE_URL') || 'http://localhost:3000';
    this.redirectUri = `${apiBaseUrl}/api/auth/spotify/callback`;
    this.mobileRedirectUri = `${apiBaseUrl}/api/auth/spotify/mobile-callback`;
  }

  async getAuthorizationUrl(
    userId?: string,
    isMobile?: boolean,
  ): Promise<string> {
    // Generate a random state parameter to prevent CSRF
    const state = crypto.randomBytes(16).toString('hex');

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // If userId is provided, this is for linking to existing account
    // If not, this is for registration/login flow
    this.stateMap.set(state, {
      userId,
      expiresAt,
      isNewUser: !userId,
      isMobile,
    });

    // Clean up expired states
    this.cleanExpiredStates();

    const scope = [
      'user-read-private',
      'user-read-email',
      'playlist-read-private',
      'playlist-read-collaborative',
      'user-library-read',
    ].join(' ');

    // Use appropriate redirect URI based on platform
    const redirectUri = isMobile ? this.mobileRedirectUri : this.redirectUri;

    // Construct the Spotify authorization URL
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
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
    const isMobile = stateData!.isMobile;
    let userId = stateData!.userId;

    this.stateMap.delete(state);

    const tokenData = await this.exchangeCodeForTokens(code, isMobile);

    const profile = await this.getSpotifyUserProfile(tokenData.access_token);

    const spotifyPlatform = await this.prismaService.platform.findFirst({
      where: { name: 'Spotify' },
    });

    if (!spotifyPlatform) {
      throw new NotFoundException('Spotify platform not found in database');
    }
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setSeconds(
      tokenExpiresAt.getSeconds() + tokenData.expires_in,
    );
    const existingOAuthUser = await this.prismaService.user.findFirst({
      where: {
        oauth_provider: 'spotify',
        oauth_id: profile.id,
      },
    });

    // If this is an account linking flow (userId provided), link to the specified user
    // regardless of whether the Spotify account was used to create a different user
    if (!isNewUser && userId) {
      // This is account linking - link to the specified authenticated user
      const linkedAccountData: CreateLinkedAccountDto = {
        user_id: userId,
        platform_id: spotifyPlatform.platform_id,
        external_user_id: profile.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: tokenExpiresAt,
      };

      const existingAccount = await this.prismaService.linkedAccount.findFirst({
        where: {
          user_id: userId,
          platform_id: spotifyPlatform.platform_id,
        },
      });

      if (existingAccount) {
        await this.prismaService.linkedAccount.update({
          where: { linked_account_id: existingAccount.linked_account_id },
          data: {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expires_at: tokenExpiresAt,
            deleted: false,
          },
        });
      } else {
        await this.linkedAccountsService.create(linkedAccountData);
      }

      // Return success without token - this is account linking, not login
      return { success: true, isNewUser: false, needsRoleSelection: false };
    }

    // If there's an existing OAuth user and this is a login flow (not account linking)
    if (existingOAuthUser && isNewUser) {
      const existingLinkedAccount =
        await this.prismaService.linkedAccount.findFirst({
          where: {
            user_id: existingOAuthUser.user_id,
            platform_id: spotifyPlatform.platform_id,
          },
        });

      if (existingLinkedAccount) {
        await this.prismaService.linkedAccount.update({
          where: { linked_account_id: existingLinkedAccount.linked_account_id },
          data: {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expires_at: tokenExpiresAt,
          },
        });
      } else {
        const linkedAccountData: CreateLinkedAccountDto = {
          user_id: existingOAuthUser.user_id,
          platform_id: spotifyPlatform.platform_id,
          external_user_id: profile.id,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: tokenExpiresAt,
        };
        await this.linkedAccountsService.create(linkedAccountData);
      }

      const tokenResult = this.authService.generateToken(existingOAuthUser);

      const needsRoleSelection = !existingOAuthUser.role;

      return {
        ...tokenResult,
        isNewUser: false,
        needsRoleSelection,
        user: existingOAuthUser,
      };
    } // If this is a new user registration flow
    if (isNewUser) {
      const email = profile.email || `${profile.id}@spotify.user`;
      const username = profile.display_name || `spotify_user_${profile.id}`;

      // Generate a random password - user won't need to know it anyway
      const password = crypto.randomBytes(16).toString('hex');

      const registerResult = await this.authService.register({
        email,
        username,
        password,
        oauth_provider: 'spotify',
        oauth_id: profile.id,
      });

      userId = registerResult.user.id;

      // Create linked account for the new user
      const linkedAccountData: CreateLinkedAccountDto = {
        user_id: userId,
        platform_id: spotifyPlatform.platform_id,
        external_user_id: profile.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: tokenExpiresAt,
      };

      await this.linkedAccountsService.create(linkedAccountData);

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
      };
    }

    // This should not happen - either account linking or new user registration
    throw new UnauthorizedException('Invalid authentication flow');
  }

  private async exchangeCodeForTokens(code: string, isMobile?: boolean): Promise<any> {
    const redirectUri = isMobile ? this.mobileRedirectUri : this.redirectUri;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
    };

    try {
      const { data } = await firstValueFrom(
        this.httpService
          .post('https://accounts.spotify.com/api/token', params.toString(), {
            headers,
          })
          .pipe(
            catchError((error) => {
              throw new BadRequestException(
                `Failed to exchange code for tokens: ${error.message}`,
              );
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
      Authorization: `Bearer ${accessToken}`,
    };

    try {
      const { data } = await firstValueFrom(
        this.httpService.get('https://api.spotify.com/v1/me', { headers }).pipe(
          catchError((error) => {
            throw new BadRequestException(
              `Failed to fetch Spotify user profile: ${error.message}`,
            );
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

  async getUserPlaylists(userId: string, limit = 50, offset = 0): Promise<any> {
    const spotifyPlatform = await this.prismaService.platform.findFirst({
      where: { name: 'Spotify' },
    });

    if (!spotifyPlatform) {
      throw new NotFoundException('Spotify platform not found in database');
    }

    const linkedAccount = await this.prismaService.linkedAccount.findFirst({
      where: {
        user_id: userId,
        platform_id: spotifyPlatform.platform_id,
      },
    });

    if (!linkedAccount) {
      throw new NotFoundException('Spotify account not linked for this user');
    }

    if (
      linkedAccount.token_expires_at &&
      linkedAccount.token_expires_at < new Date()
    ) {
      const refreshedAccount = await this.refreshAccessToken(
        userId,
        spotifyPlatform.platform_id,
      );
      linkedAccount.access_token = refreshedAccount.access_token;
    }

    const headers = {
      Authorization: `Bearer ${linkedAccount.access_token}`,
    };
    try {
      const { data } = await firstValueFrom(
        this.httpService
          .get(
            `https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`,
            { headers },
          )
          .pipe(
            catchError((error) => {
              throw new BadRequestException(
                `Failed to fetch Spotify playlists: ${error.message}`,
              );
            }),
          ),
      );

      const ownedPlaylists = data.items.filter((playlist) => {
        return (
          playlist.owner && playlist.owner.id === linkedAccount.external_user_id
        );
      });

      const playlistsWithTracks = await Promise.all(
        ownedPlaylists.map(async (playlist) => {
          try {
            const tracksResponse = await firstValueFrom(
              this.httpService
                .get(
                  `https://api.spotify.com/v1/playlists/${playlist.id}/tracks?limit=50`,
                  { headers },
                )
                .pipe(
                  catchError((error) => {
                    console.warn(
                      `Failed to fetch tracks for playlist ${playlist.id}:`,
                      error.message,
                    );
                    return of({ data: { items: [] } });
                  }),
                ),
            );

            return {
              ...playlist,
              tracks: {
                ...playlist.tracks,
                items: tracksResponse.data.items,
              },
            };
          } catch (error) {
            console.warn(
              `Error fetching tracks for playlist ${playlist.id}:`,
              error,
            );
            return playlist;
          }
        }),
      );

      return {
        ...data,
        items: playlistsWithTracks,
        total: ownedPlaylists.length,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to fetch playlists: ${error.message}`,
      );
    }
  }

  // Method to refresh an access token when it expires
  async refreshAccessToken(userId: string, platformId: number): Promise<any> {
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
      Authorization:
        'Basic ' +
        Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
    };

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: linkedAccount.refresh_token,
    });

    try {
      const { data } = await firstValueFrom(
        this.httpService
          .post('https://accounts.spotify.com/api/token', params.toString(), {
            headers,
          })
          .pipe(
            catchError((error) => {
              throw new BadRequestException(
                `Failed to refresh token: ${error.message}`,
              );
            }),
          ),
      );

      const tokenExpiresAt = new Date();
      tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + data.expires_in);

      return this.prismaService.linkedAccount.update({
        where: { linked_account_id: linkedAccount.linked_account_id },
        data: {
          access_token: data.access_token,
          token_expires_at: tokenExpiresAt,
          refresh_token: data.refresh_token || linkedAccount.refresh_token,
        },
      });
    } catch (error) {
      throw new BadRequestException(`Token refresh failed: ${error.message}`);
    }
  }
  // Get user tracks from Spotify (for artists)
  async getUserTracks(userId: string, limit = 50, offset = 0): Promise<any> {
    const spotifyPlatform = await this.prismaService.platform.findFirst({
      where: { name: 'Spotify' },
    });

    if (!spotifyPlatform) {
      throw new NotFoundException('Spotify platform not found in database');
    }

    const linkedAccount = await this.prismaService.linkedAccount.findFirst({
      where: {
        user_id: userId,
        platform_id: spotifyPlatform.platform_id,
      },
    });

    if (!linkedAccount) {
      throw new NotFoundException('Spotify account not linked for this user');
    }

    if (
      linkedAccount.token_expires_at &&
      linkedAccount.token_expires_at < new Date()
    ) {
      const refreshedAccount = await this.refreshAccessToken(
        userId,
        spotifyPlatform.platform_id,
      );
      linkedAccount.access_token = refreshedAccount.access_token;
    }

    const profile = await this.getSpotifyUserProfile(
      linkedAccount.access_token,
    );

    const headers = {
      Authorization: `Bearer ${linkedAccount.access_token}`,
    };
    try {
      let artistTracks: any[] = [];

      // Search for the user as an artist
      try {
        const searchResponse = await firstValueFrom(
          this.httpService.get(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(profile.display_name)}&type=artist&limit=1`,
            { headers },
          ),
        );

        if (searchResponse.data.artists.items.length > 0) {
          const artistId = searchResponse.data.artists.items[0].id;

          // Get artist's albums
          try {
            const albumsResponse = await firstValueFrom(
              this.httpService.get(
                `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=${limit}&offset=${offset}`,
                { headers },
              ),
            );

            // For each album, get the tracks
            for (const album of albumsResponse.data.items) {
              try {
                const tracksResponse = await firstValueFrom(
                  this.httpService.get(
                    `https://api.spotify.com/v1/albums/${album.id}/tracks`,
                    { headers },
                  ),
                );

                // Add album cover to each track
                const tracksWithAlbum = tracksResponse.data.items.map(
                  (track: any) => ({
                    ...track,
                    album: {
                      id: album.id,
                      name: album.name,
                      images: album.images,
                      release_date: album.release_date,
                    },
                  }),
                );

                artistTracks = [...artistTracks, ...tracksWithAlbum];
              } catch (error) {
                console.warn(
                  `Failed to fetch tracks for album ${album.id}:`,
                  error.message,
                );
              }
            }
          } catch (error) {
            console.warn('Failed to fetch artist albums:', error.message);
          }
        }
      } catch (error) {
        console.warn('Failed to search for artist:', error.message);
      }
    } catch (error) {
      throw new BadRequestException(`Failed to fetch tracks: ${error.message}`);
    }
  }
  // Get tracks for a specific playlist from Spotify
  async getPlaylistTracks(playlistId: string, userId: string): Promise<any> {
    const spotifyPlatform = await this.prismaService.platform.findFirst({
      where: { name: 'Spotify' },
    });

    if (!spotifyPlatform) {
      throw new NotFoundException('Spotify platform not found in database');
    }

    const linkedAccount = await this.prismaService.linkedAccount.findFirst({
      where: {
        user_id: userId,
        platform_id: spotifyPlatform.platform_id,
      },
    });

    if (!linkedAccount) {
      throw new NotFoundException('Spotify account not linked for this user');
    }

    if (
      linkedAccount.token_expires_at &&
      linkedAccount.token_expires_at < new Date()
    ) {
      const refreshedAccount = await this.refreshAccessToken(
        userId,
        spotifyPlatform.platform_id,
      );
      linkedAccount.access_token = refreshedAccount.access_token;
    }

    const headers = {
      Authorization: `Bearer ${linkedAccount.access_token}`,
    };

    try {
      let allTracks = [];
      let offset = 0;
      const limit = 50;
      let hasMore = true;
      let totalCount = 0;

      // Fetch tracks in chunks to avoid response truncation
      while (hasMore && allTracks.length < 500) {
        const { data } = await firstValueFrom(
          this.httpService
            .get(
              `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`,
              { headers },
            )
            .pipe(
              catchError((error) => {
                throw new BadRequestException(
                  `Failed to fetch Spotify playlist tracks: ${error.message}`,
                );
              }),
            ),
        );

        if (offset === 0) {
          totalCount = data.total;
        }

        // Transform and add tracks
        const tracks = data.items
          .filter((item: any) => item.track && item.track.id)
          .map((item: any) => ({
            track_id: item.track.id,
            title: item.track.name,
            artist: item.track.artists
              .map((artist: any) => artist.name)
              .join(', '),
            album: item.track.album?.name,
            duration_ms: item.track.duration_ms,
            thumbnail_url: item.track.album?.images?.[0]?.url,
            url: item.track.external_urls?.spotify,
            platform_specific_id: item.track.id,
            added_at: item.added_at,
            preview_url: item.track.preview_url,
            popularity: item.track.popularity,
            explicit: item.track.explicit,
            type: 'spotify',
          }));

        allTracks = allTracks.concat(tracks);
        offset += limit;
        hasMore = data.next !== null && allTracks.length < data.total;

        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      return {
        tracks: allTracks,
        total: totalCount,
        fetched: allTracks.length,
        limit: limit,
        hasMore: allTracks.length < totalCount,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to fetch playlist tracks: ${error.message}`,
      );
    }
  }
  async importPlaylistsToDatabase(
    userId: string,
    playlistIds: string[],
  ): Promise<any> {
    const spotifyPlatform = await this.prismaService.platform.findFirst({
      where: { name: 'Spotify' },
    });

    if (!spotifyPlatform) {
      throw new NotFoundException('Spotify platform not found in database');
    }

    const linkedAccount = await this.prismaService.linkedAccount.findFirst({
      where: {
        user_id: userId,
        platform_id: spotifyPlatform.platform_id,
      },
    });

    if (!linkedAccount) {
      throw new NotFoundException('Spotify account not linked for this user');
    }

    if (
      linkedAccount.token_expires_at &&
      linkedAccount.token_expires_at < new Date()
    ) {
      const refreshedAccount = await this.refreshAccessToken(
        userId,
        spotifyPlatform.platform_id,
      );
      linkedAccount.access_token = refreshedAccount.access_token;
    }

    const headers = {
      Authorization: `Bearer ${linkedAccount.access_token}`,
    };

    const importedPlaylists: any[] = [];
    const updatedPlaylists: any[] = [];
    const failedPlaylists: any[] = [];

    for (const playlistId of playlistIds) {
      try {
        const { data: playlistData } = await firstValueFrom(
          this.httpService
            .get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
              headers,
            })
            .pipe(
              catchError((error) => {
                throw new BadRequestException(
                  `Failed to fetch Spotify playlist ${playlistId}: ${error.message}`,
                );
              }),
            ),
        );
        const existingPlaylist = await this.prismaService.playlist.findFirst({
          where: {
            platform_id: spotifyPlatform.platform_id,
            platform_specific_id: playlistId,
          },
          include: {
            creator: {
              select: {
                user_id: true,
                username: true,
                email: true,
              },
            },
          },
        });

        if (existingPlaylist && existingPlaylist.creator_id !== userId) {
          throw new ConflictException(
            `Playlist "${existingPlaylist.name}" is already registered in our database by user ${existingPlaylist.creator.username} (${existingPlaylist.creator.email}). Please contact administrator help for assistance.`,
          );
        }

        const playlistUpdateData = {
          name: playlistData.name,
          description: playlistData.description || null,
          url: playlistData.external_urls?.spotify || null,
          cover_image_url: playlistData.images?.[0]?.url || null,
          is_visible: true,
          track_count: playlistData.tracks?.total || 0,
          deleted: false,
          updated_at: new Date(),
        };

        if (existingPlaylist) {
          const updatedPlaylist = await this.prismaService.playlist.update({
            where: { playlist_id: existingPlaylist.playlist_id },
            data: playlistUpdateData,
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

          updatedPlaylists.push(updatedPlaylist);
        } else {
          const newPlaylist = await this.prismaService.playlist.create({
            data: {
              playlist_id: uuidv4(),
              creator_id: userId,
              platform_id: spotifyPlatform.platform_id,
              platform_specific_id: playlistId,
              submission_fee: 0,
              created_at: new Date(),
              ...playlistUpdateData,
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
        }
      } catch (error) {
        console.error(`Failed to import/update playlist ${playlistId}:`, error);
        failedPlaylists.push({
          id: playlistId,
          name: 'Unknown',
          reason: 'Import/update failed',
        });
      }
    }

    return {
      imported: importedPlaylists,
      updated: updatedPlaylists,
      failed: failedPlaylists,
      message: `Successfully imported ${importedPlaylists.length} playlist(s) and updated ${updatedPlaylists.length} playlist(s). ${failedPlaylists.length} playlist(s) failed.`,
    };
  }

  async syncUserPlaylists(userId: string): Promise<any> {
    const spotifyPlatform = await this.prismaService.platform.findFirst({
      where: { name: 'Spotify' },
    });

    if (!spotifyPlatform) {
      throw new NotFoundException('Spotify platform not found in database');
    }

    const existingPlaylists = await this.prismaService.playlist.findMany({
      where: {
        creator_id: userId,
        platform_id: spotifyPlatform.platform_id,
        deleted: false,
      },
    });

    if (existingPlaylists.length === 0) {
      return {
        updated: 0,
        message: 'No existing playlists found to sync',
      };
    }

    const spotifyPlaylists = await this.getUserPlaylists(userId);

    const updatedPlaylists: any[] = [];
    const syncErrors: any[] = [];

    for (const existingPlaylist of existingPlaylists) {
      try {
        const spotifyPlaylist = spotifyPlaylists.items.find(
          (sp: any) => sp.id === existingPlaylist.platform_specific_id,
        );

        if (spotifyPlaylist) {
          const updatedPlaylist = await this.prismaService.playlist.update({
            where: { playlist_id: existingPlaylist.playlist_id },
            data: {
              name: spotifyPlaylist.name,
              description: spotifyPlaylist.description || null,
              url: spotifyPlaylist.external_urls?.spotify || null,
              cover_image_url: spotifyPlaylist.images?.[0]?.url || null,
              track_count: spotifyPlaylist.tracks?.total || 0,
              updated_at: new Date(),
            },
            include: {
              creator: {
                select: {
                  username: true,
                },
              },
              platform: true,
            },
          });

          updatedPlaylists.push(updatedPlaylist);
        }
      } catch (error) {
        console.error(
          `Failed to sync playlist ${existingPlaylist.playlist_id}:`,
          error,
        );
        syncErrors.push({
          id: existingPlaylist.playlist_id,
          name: existingPlaylist.name,
          error: error.message,
        });
      }
    }

    return {
      updated: updatedPlaylists.length,
      errors: syncErrors.length,
      message: `Successfully synced ${updatedPlaylists.length} playlist(s). ${syncErrors.length} error(s).`,
    };
  }

  // Sync user's existing tracks/songs with fresh data from Spotify
  async syncUserTracks(userId: string): Promise<any> {
    const spotifyPlatform = await this.prismaService.platform.findFirst({
      where: { name: 'Spotify' },
    });

    if (!spotifyPlatform) {
      throw new NotFoundException('Spotify platform not found in database');
    }

    const existingSongs = await this.prismaService.song.findMany({
      where: {
        artist_id: userId,
        platform_id: spotifyPlatform.platform_id,
        deleted: false,
      },
    });

    if (existingSongs.length === 0) {
      return {
        updated: [],
        errors: [],
        message: 'No existing songs found to sync',
      };
    }

    const linkedAccount = await this.prismaService.linkedAccount.findFirst({
      where: {
        user_id: userId,
        platform_id: spotifyPlatform.platform_id,
      },
    });

    if (!linkedAccount) {
      throw new NotFoundException('Spotify account not linked for this user');
    }

    if (
      linkedAccount.token_expires_at &&
      linkedAccount.token_expires_at < new Date()
    ) {
      const refreshedAccount = await this.refreshAccessToken(
        userId,
        spotifyPlatform.platform_id,
      );
      linkedAccount.access_token = refreshedAccount.access_token;
    }

    const headers = {
      Authorization: `Bearer ${linkedAccount.access_token}`,
    };

    const updatedSongs: any[] = [];
    const syncErrors: any[] = [];

    const trackIds = existingSongs.map((song) => song.platform_specific_id);

    const chunkSize = 50;
    for (let i = 0; i < trackIds.length; i += chunkSize) {
      const chunk = trackIds.slice(i, i + chunkSize);

      try {
        const { data: tracksData } = await firstValueFrom(
          this.httpService
            .get(`https://api.spotify.com/v1/tracks?ids=${chunk.join(',')}`, {
              headers,
            })
            .pipe(
              catchError((error) => {
                throw new BadRequestException(
                  `Failed to fetch Spotify tracks: ${error.message}`,
                );
              }),
            ),
        );

        for (const track of tracksData.tracks || []) {
          if (!track) continue;

          try {
            const existingSong = existingSongs.find(
              (song) => song.platform_specific_id === track.id,
            );

            if (existingSong) {
              const updatedSong = await this.prismaService.song.update({
                where: { song_id: existingSong.song_id },
                data: {
                  title: track.name,
                  artist_name_on_platform: track.artists
                    .map((artist: any) => artist.name)
                    .join(', '),
                  album_name: track.album?.name || null,
                  url: track.external_urls?.spotify || null,
                  cover_image_url: track.album?.images?.[0]?.url || null,
                  duration_ms: track.duration_ms || null,
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

              updatedSongs.push(updatedSong);
            }
          } catch (error) {
            console.error(`Failed to sync song ${track.id}:`, error);
            syncErrors.push({
              id: track.id,
              title: track.name || 'Unknown',
              error: error.message,
            });
          }
        }
      } catch (error) {
        console.error(`Failed to fetch track chunk:`, error);
        chunk.forEach((trackId) => {
          const existingSong = existingSongs.find(
            (song) => song.platform_specific_id === trackId,
          );
          syncErrors.push({
            id: trackId,
            title: existingSong?.title || 'Unknown',
            error: error.message,
          });
        });
      }

      if (i + chunkSize < trackIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return {
      updated: updatedSongs,
      errors: syncErrors,
      message: `Successfully synced ${updatedSongs.length} song(s). ${syncErrors.length} error(s).`,
    };
  }

  async importTracksToDatabase(
    userId: string,
    trackIds: string[],
  ): Promise<any> {
    const spotifyPlatform = await this.prismaService.platform.findFirst({
      where: { name: 'Spotify' },
    });

    if (!spotifyPlatform) {
      throw new NotFoundException('Spotify platform not found in database');
    }

    const linkedAccount = await this.prismaService.linkedAccount.findFirst({
      where: {
        user_id: userId,
        platform_id: spotifyPlatform.platform_id,
      },
    });

    if (!linkedAccount) {
      throw new NotFoundException('Spotify account not linked for this user');
    }

    if (
      linkedAccount.token_expires_at &&
      linkedAccount.token_expires_at < new Date()
    ) {
      const refreshedAccount = await this.refreshAccessToken(
        userId,
        spotifyPlatform.platform_id,
      );
      linkedAccount.access_token = refreshedAccount.access_token;
    }

    const headers = {
      Authorization: `Bearer ${linkedAccount.access_token}`,
    };

    const importedTracks: any[] = [];
    const updatedTracks: any[] = [];
    const failedTracks: any[] = [];

    const chunkSize = 50;
    for (let i = 0; i < trackIds.length; i += chunkSize) {
      const chunk = trackIds.slice(i, i + chunkSize);

      try {
        const { data: tracksData } = await firstValueFrom(
          this.httpService
            .get(`https://api.spotify.com/v1/tracks?ids=${chunk.join(',')}`, {
              headers,
            })
            .pipe(
              catchError((error) => {
                throw new BadRequestException(
                  `Failed to fetch Spotify tracks: ${error.message}`,
                );
              }),
            ),
        );

        for (const track of tracksData.tracks || []) {
          if (!track) continue;

          try {
            const existingSong = await this.prismaService.song.findFirst({
              where: {
                platform_id: spotifyPlatform.platform_id,
                platform_specific_id: track.id,
              },
              include: {
                artist: {
                  select: {
                    user_id: true,
                    username: true,
                    email: true,
                  },
                },
              },
            });

            if (existingSong && existingSong.artist_id !== userId) {
              throw new ConflictException(
                `Song "${existingSong.title}" is already registered in our database by user ${existingSong.artist.username} (${existingSong.artist.email}). Please contact administrator help for assistance.`,
              );
            }

            const songUpdateData = {
              title: track.name,
              artist_name_on_platform: track.artists
                .map((artist: any) => artist.name)
                .join(', '),
              album_name: track.album?.name || null,
              url: track.external_urls?.spotify || null,
              cover_image_url: track.album?.images?.[0]?.url || null,
              duration_ms: track.duration_ms || null,
              is_visible: true,
              deleted: false,
              updated_at: new Date(),
            };

            if (existingSong) {
              const updatedSong = await this.prismaService.song.update({
                where: { song_id: existingSong.song_id },
                data: songUpdateData,
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

              updatedTracks.push(updatedSong);
            } else {
              const newSong = await this.prismaService.song.create({
                data: {
                  song_id: uuidv4(),
                  artist_id: userId,
                  platform_id: spotifyPlatform.platform_id,
                  platform_specific_id: track.id,
                  created_at: new Date(),
                  ...songUpdateData,
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
            }
          } catch (error) {
            console.error(`Failed to import/update track ${track.id}:`, error);
            failedTracks.push({
              id: track.id,
              title: track.name || 'Unknown',
              reason: 'Import/update failed',
            });
          }
        }
      } catch (error) {
        console.error(`Failed to fetch track chunk:`, error);
        chunk.forEach((trackId) => {
          failedTracks.push({
            id: trackId,
            title: 'Unknown',
            reason: 'Fetch failed',
          });
        });
      }

      if (i + chunkSize < trackIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return {
      imported: importedTracks,
      updated: updatedTracks,
      failed: failedTracks,
      message: `Successfully imported ${importedTracks.length} track(s) and updated ${updatedTracks.length} track(s). ${failedTracks.length} track(s) failed.`,
    };
  }
}
