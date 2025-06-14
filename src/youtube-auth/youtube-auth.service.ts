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
import { catchError, firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class YoutubeAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly apiKey: string;
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
      this.configService.get<string>('YOUTUBE_CLIENT_ID') || 'test_client_id';
    this.clientSecret =
      this.configService.get<string>('YOUTUBE_CLIENT_SECRET') ||
      'test_client_secret';
    this.apiKey =
      this.configService.get<string>('YOUTUBE_API_KEY') || 'test_api_key';

    const apiBaseUrl =
      this.configService.get<string>('API_BASE_URL') || 'http://localhost:3000';
    this.redirectUri = `${apiBaseUrl}/api/auth/youtube/callback`;
    this.mobileRedirectUri = `${apiBaseUrl}/api/auth/youtube/mobile-callback`;
  }

  async getAuthorizationUrl(
    userId?: string,
    isMobile?: boolean,
  ): Promise<string> {
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
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' ');

    const redirectUri = isMobile ? this.mobileRedirectUri : this.redirectUri;

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<any> {
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

    const profile = await this.getUserProfile(tokenData.access_token);

    const channelInfo = await this.getYouTubeChannelInfo(
      tokenData.access_token,
    );
    const youtubeId = channelInfo?.items?.[0]?.id || profile.id;

    const youtubePlatform = await this.prismaService.platform.findFirst({
      where: { name: 'YouTube' },
    });

    if (!youtubePlatform) {
      throw new NotFoundException('YouTube platform not found in database');
    }
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setSeconds(
      tokenExpiresAt.getSeconds() + tokenData.expires_in,
    );
    const existingOAuthUser = await this.prismaService.user.findFirst({
      where: {
        oauth_provider: 'youtube',
        oauth_id: youtubeId,
      },
    });

    // If this is an account linking flow (userId provided), link to the specified user
    // regardless of whether the YouTube account was used to create a different user
    if (!isNewUser && userId) {
      // This is account linking - link to the specified authenticated user
      const linkedAccountData: CreateLinkedAccountDto = {
        user_id: userId,
        platform_id: youtubePlatform.platform_id,
        external_user_id: youtubeId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: tokenExpiresAt,
      };

      const existingAccount = await this.prismaService.linkedAccount.findFirst({
        where: {
          user_id: userId,
          platform_id: youtubePlatform.platform_id,
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
            platform_id: youtubePlatform.platform_id,
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
          platform_id: youtubePlatform.platform_id,
          external_user_id: youtubeId,
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
      const email = profile.email || `${youtubeId}@youtube.user`;
      const username =
        profile.name ||
        channelInfo?.items?.[0]?.snippet?.title ||
        `youtube_user_${youtubeId}`;

      // Generate a random password
      const password = crypto.randomBytes(16).toString('hex');
      const registerResult = await this.authService.register({
        email,
        username,
        password,
        oauth_provider: 'youtube',
        oauth_id: youtubeId,
      });

      userId = registerResult.user.id;

      // Create linked account for the new user
      const linkedAccountData: CreateLinkedAccountDto = {
        user_id: userId,
        platform_id: youtubePlatform.platform_id,
        external_user_id: youtubeId,
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
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    try {
      const { data } = await firstValueFrom(
        this.httpService
          .post('https://oauth2.googleapis.com/token', params.toString(), {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
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

  private async getUserProfile(accessToken: string): Promise<any> {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };

    try {
      const { data } = await firstValueFrom(
        this.httpService
          .get('https://www.googleapis.com/oauth2/v2/userinfo', { headers })
          .pipe(
            catchError((error) => {
              throw new BadRequestException(
                `Failed to fetch Google user profile: ${error.message}`,
              );
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
      Authorization: `Bearer ${accessToken}`,
    };

    try {
      const { data } = await firstValueFrom(
        this.httpService
          .get(
            'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
            { headers },
          )
          .pipe(
            catchError((error) => {
              return [];
            }),
          ),
      );

      return data;
    } catch (error) {
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

  async getUserChannels(userId: string, limit = 50, offset = 0): Promise<any> {
    const youtubePlatform = await this.prismaService.platform.findFirst({
      where: { name: 'YouTube' },
    });

    if (!youtubePlatform) {
      throw new NotFoundException('YouTube platform not found in database');
    }

    const linkedAccount = await this.prismaService.linkedAccount.findFirst({
      where: {
        user_id: userId,
        platform_id: youtubePlatform.platform_id,
      },
    });

    if (!linkedAccount) {
      throw new NotFoundException('YouTube account not linked for this user');
    }

    if (
      linkedAccount.token_expires_at &&
      linkedAccount.token_expires_at < new Date()
    ) {
      const refreshedAccount = await this.refreshAccessToken(
        userId,
        youtubePlatform.platform_id,
      );
      linkedAccount.access_token = refreshedAccount.access_token;
    }
    try {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails,statistics',
        mine: 'true',
        key: this.apiKey,
      });

      const headers = {
        Authorization: `Bearer ${linkedAccount.access_token}`,
      };

      const { data } = await firstValueFrom(
        this.httpService
          .get(
            `https://www.googleapis.com/youtube/v3/channels?${params.toString()}`,
            { headers },
          )
          .pipe(
            catchError((error) => {
              throw new BadRequestException(
                `Failed to fetch YouTube channels: ${error.response?.data?.error?.message || error.message}`,
              );
            }),
          ),
      );

      return data;
    } catch (error) {
      throw new BadRequestException(
        `Failed to fetch channels: ${error.message}`,
      );
    }
  }

  async getUserPlaylists(userId: string, limit = 50, offset = 0): Promise<any> {
    const youtubePlatform = await this.prismaService.platform.findFirst({
      where: { name: 'YouTube' },
    });

    if (!youtubePlatform) {
      throw new NotFoundException('YouTube platform not found in database');
    }

    const linkedAccount = await this.prismaService.linkedAccount.findFirst({
      where: {
        user_id: userId,
        platform_id: youtubePlatform.platform_id,
      },
    });

    if (!linkedAccount) {
      throw new NotFoundException('YouTube account not linked for this user');
    }

    if (
      linkedAccount.token_expires_at &&
      linkedAccount.token_expires_at < new Date()
    ) {
      const refreshedAccount = await this.refreshAccessToken(
        userId,
        youtubePlatform.platform_id,
      );
      linkedAccount.access_token = refreshedAccount.access_token;
    }

    try {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails',
        mine: 'true',
        maxResults: limit.toString(),
        key: this.apiKey,
      });

      if (offset > 0) {
        params.append('pageToken', offset.toString());
      }

      const headers = {
        Authorization: `Bearer ${linkedAccount.access_token}`,
      };

      const { data } = await firstValueFrom(
        this.httpService
          .get(
            `https://www.googleapis.com/youtube/v3/playlists?${params.toString()}`,
            { headers },
          )
          .pipe(
            catchError((error) => {
              throw new BadRequestException(
                `Failed to fetch YouTube playlists: ${error.response?.data?.error?.message || error.message}`,
              );
            }),
          ),
      );

      return data;
    } catch (error) {
      throw new BadRequestException(
        `Failed to fetch playlists: ${error.message}`,
      );
    }
  }
  async getUserVideos(
    userId: string,
    limit = 50,
    offset = 0,
    musicOnly = false,
  ): Promise<any> {
    const youtubePlatform = await this.prismaService.platform.findFirst({
      where: { name: 'YouTube' },
    });

    if (!youtubePlatform) {
      throw new NotFoundException('YouTube platform not found in database');
    }

    const linkedAccount = await this.prismaService.linkedAccount.findFirst({
      where: {
        user_id: userId,
        platform_id: youtubePlatform.platform_id,
      },
    });

    if (!linkedAccount) {
      throw new NotFoundException('YouTube account not linked for this user');
    }

    if (
      linkedAccount.token_expires_at &&
      linkedAccount.token_expires_at < new Date()
    ) {
      const refreshedAccount = await this.refreshAccessToken(
        userId,
        youtubePlatform.platform_id,
      );
      linkedAccount.access_token = refreshedAccount.access_token;
    }

    const channelsResponse = await this.getUserChannels(userId);

    if (!channelsResponse.items || channelsResponse.items.length === 0) {
      throw new BadRequestException('No YouTube channels found for this user');
    }

    const channelId = channelsResponse.items[0].id;

    const headers = {
      Authorization: `Bearer ${linkedAccount.access_token}`,
    };

    try {
      const { data } = await firstValueFrom(
        this.httpService
          .get(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=${limit}&type=video&order=date&pageToken=${offset > 0 ? offset : ''}`,
            { headers },
          )
          .pipe(
            catchError((error) => {
              throw new BadRequestException(
                `Failed to fetch YouTube videos: ${error.message}`,
              );
            }),
          ),
      );

      if (musicOnly && data.items && data.items.length > 0) {
        const videoIds = data.items
          .map((item: any) => item.id.videoId)
          .join(',');

        try {
          const videoDetailsResponse = await firstValueFrom(
            this.httpService
              .get(
                `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds}`,
                { headers },
              )
              .pipe(
                catchError((error) => {
                  console.warn(
                    'Failed to fetch video details for music filtering:',
                    error.message,
                  );
                  throw new BadRequestException(
                    `Failed to fetch video details: ${error.message}`,
                  );
                }),
              ),
          );

          const musicVideoIds = new Set(
            videoDetailsResponse.data.items
              .filter((video: any) => video.snippet.categoryId === '10')
              .map((video: any) => video.id),
          );

          data.items = data.items.filter((item: any) =>
            musicVideoIds.has(item.id.videoId),
          );
        } catch (error) {
          console.warn(
            'Error filtering videos by music category:',
            error.message,
          );
        }
      }

      return data;
    } catch (error) {
      throw new BadRequestException(`Failed to fetch videos: ${error.message}`);
    }
  }

  async getUserSongs(userId: string, limit = 50, offset = 0): Promise<any> {
    return this.getUserVideos(userId, limit, offset, true);
  }

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

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: linkedAccount.refresh_token,
      grant_type: 'refresh_token',
    });

    try {
      const { data } = await firstValueFrom(
        this.httpService
          .post('https://oauth2.googleapis.com/token', params.toString(), {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
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
  async getPlaylistTracks(playlistId: string, userId: string): Promise<any> {
    const youtubePlatform = await this.prismaService.platform.findFirst({
      where: { name: 'YouTube' },
    });

    if (!youtubePlatform) {
      throw new NotFoundException('YouTube platform not found in database');
    }

    const linkedAccount = await this.prismaService.linkedAccount.findFirst({
      where: {
        user_id: userId,
        platform_id: youtubePlatform.platform_id,
      },
    });

    if (!linkedAccount) {
      throw new NotFoundException('YouTube account not linked for this user');
    }
    if (
      linkedAccount.token_expires_at &&
      linkedAccount.token_expires_at < new Date()
    ) {
      const refreshedAccount = await this.refreshAccessToken(
        userId,
        youtubePlatform.platform_id,
      );
      linkedAccount.access_token = refreshedAccount.access_token;
    }

    try {
      let allTracks = [];
      let nextPageToken = '';
      const maxResults = 50;
      let totalCount = 0;
      let pageCount = 0;
      const maxPages = 10; // Limit to prevent infinite loops

      do {
        const params = new URLSearchParams({
          part: 'snippet,contentDetails',
          playlistId: playlistId,
          maxResults: maxResults.toString(),
          key: this.apiKey,
        });

        if (nextPageToken) {
          params.append('pageToken', nextPageToken);
        }

        const headers = {
          Authorization: `Bearer ${linkedAccount.access_token}`,
        };
        const response = await firstValueFrom(
          this.httpService
            .get(
              `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`,
              { headers },
            )
            .pipe(
              catchError((error) => {
                // If OAuth fails, try with API key only for public playlists
                if (
                  error.response?.status === 403 ||
                  error.response?.status === 401
                ) {
                  console.warn(
                    'OAuth failed, trying with API key only for public playlist',
                  );
                  return this.httpService
                    .get(
                      `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`,
                    )
                    .pipe(
                      catchError((apiKeyError) => {
                        throw new BadRequestException(
                          `Failed to fetch YouTube playlist tracks: ${apiKeyError.response?.data?.error?.message || apiKeyError.message}`,
                        );
                      }),
                    );
                }
                throw new BadRequestException(
                  `Failed to fetch YouTube playlist tracks: ${error.response?.data?.error?.message || error.message}`,
                );
              }),
            ),
        );
        const data = response.data;

        if (pageCount === 0) {
          totalCount = data.pageInfo?.totalResults || 0;
        }

        const tracks = (data.items || [])
          .filter((item: any) => item.contentDetails?.videoId) // Filter out unavailable videos
          .map((item: any) => ({
            track_id: item.contentDetails.videoId,
            title: item.snippet.title,
            artist:
              item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle,
            duration_ms: null, // YouTube API requires separate call for duration
            thumbnail_url:
              item.snippet.thumbnails?.medium?.url ||
              item.snippet.thumbnails?.default?.url,
            url: `https://www.youtube.com/watch?v=${item.contentDetails.videoId}`,
            platform_specific_id: item.contentDetails.videoId,
            added_at: item.snippet.publishedAt,
            description: item.snippet.description?.substring(0, 200), // Limit description length
            position: item.snippet.position,
            type: 'youtube',
          }));

        allTracks = allTracks.concat(tracks);
        nextPageToken = data.nextPageToken || '';
        pageCount++;

        if (nextPageToken && pageCount < maxPages) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } while (nextPageToken && pageCount < maxPages && allTracks.length < 500);

      return {
        tracks: allTracks,
        total: totalCount,
        fetched: allTracks.length,
        hasMore: !!nextPageToken && allTracks.length < totalCount,
        nextPageToken: nextPageToken,
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
    const youtubePlatform = await this.prismaService.platform.findFirst({
      where: { name: 'YouTube' },
    });

    if (!youtubePlatform) {
      throw new NotFoundException('YouTube platform not found in database');
    }

    const linkedAccount = await this.prismaService.linkedAccount.findFirst({
      where: {
        user_id: userId,
        platform_id: youtubePlatform.platform_id,
      },
    });

    if (!linkedAccount) {
      throw new NotFoundException('YouTube account not linked for this user');
    }
    if (
      linkedAccount.token_expires_at &&
      linkedAccount.token_expires_at < new Date()
    ) {
      const refreshedAccount = await this.refreshAccessToken(
        userId,
        youtubePlatform.platform_id,
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
        const params = new URLSearchParams({
          part: 'snippet,contentDetails',
          id: playlistId,
          key: this.apiKey,
        });
        const playlistResponse = await firstValueFrom(
          this.httpService
            .get(
              `https://www.googleapis.com/youtube/v3/playlists?${params.toString()}`,
              { headers },
            )
            .pipe(
              catchError((error) => {
                throw new BadRequestException(
                  `Failed to fetch YouTube playlist ${playlistId}: ${error.message}`,
                );
              }),
            ),
        );
        const playlistData = playlistResponse.data;

        if (!playlistData.items || playlistData.items.length === 0) {
          failedPlaylists.push({
            id: playlistId,
            name: 'Unknown',
            reason: 'Playlist not found',
          });
          continue;
        }

        const playlist = playlistData.items[0]; // Check if playlist already exists
        const existingPlaylist = await this.prismaService.playlist.findFirst({
          where: {
            platform_id: youtubePlatform.platform_id,
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
          name: playlist.snippet.title,
          description: playlist.snippet.description || null,
          url: `https://www.youtube.com/playlist?list=${playlistId}`,
          cover_image_url:
            playlist.snippet.thumbnails?.medium?.url ||
            playlist.snippet.thumbnails?.default?.url ||
            null,
          is_visible: true,
          track_count: playlist.contentDetails.itemCount || 0,
          deleted: false, // Restore if previously deleted
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
              playlist_id: require('uuid').v4(),
              creator_id: userId,
              platform_id: youtubePlatform.platform_id,
              platform_specific_id: playlistId,
              genre: null,
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

  async importVideosToDatabase(
    userId: string,
    videoIds: string[],
  ): Promise<any> {
    const youtubePlatform = await this.prismaService.platform.findFirst({
      where: { name: 'YouTube' },
    });

    if (!youtubePlatform) {
      throw new NotFoundException('YouTube platform not found in database');
    }

    const linkedAccount = await this.prismaService.linkedAccount.findFirst({
      where: {
        user_id: userId,
        platform_id: youtubePlatform.platform_id,
      },
    });

    if (!linkedAccount) {
      throw new NotFoundException('YouTube account not linked for this user');
    }

    if (
      linkedAccount.token_expires_at &&
      linkedAccount.token_expires_at < new Date()
    ) {
      const refreshedAccount = await this.refreshAccessToken(
        userId,
        youtubePlatform.platform_id,
      );
      linkedAccount.access_token = refreshedAccount.access_token;
    }

    const headers = {
      Authorization: `Bearer ${linkedAccount.access_token}`,
    };

    const importedVideos: any[] = [];
    const updatedVideos: any[] = [];
    const failedVideos: any[] = [];

    // Process videos in chunks of 50 (YouTube API limit)
    const chunkSize = 50;
    for (let i = 0; i < videoIds.length; i += chunkSize) {
      const chunk = videoIds.slice(i, i + chunkSize);

      try {
        const params = new URLSearchParams({
          part: 'snippet,contentDetails',
          id: chunk.join(','),
          key: this.apiKey,
        });

        const { data: videosData } = await firstValueFrom(
          this.httpService
            .get(
              `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
              { headers },
            )
            .pipe(
              catchError((error) => {
                throw new BadRequestException(
                  `Failed to fetch YouTube videos: ${error.message}`,
                );
              }),
            ),
        );

        for (const video of videosData.items || []) {
          if (!video) continue; // Skip null videos

          try {
            const existingSong = await this.prismaService.song.findFirst({
              where: {
                platform_id: youtubePlatform.platform_id,
                platform_specific_id: video.id,
              },
              include: {
                artist: {
                  select: {
                    username: true,
                    email: true,
                  },
                },
              },
            });

            if (existingSong && existingSong.artist_id !== userId) {
              throw new ConflictException(
                `Video '${video.snippet.title}' is already registered by user ${existingSong.artist.username} (${existingSong.artist.email})`,
              );
            }

            // Parse duration from ISO 8601 format (PT1M23S -> 83 seconds)
            let durationMs: number | null = null;
            if (video.contentDetails?.duration) {
              const duration = video.contentDetails.duration;
              const match = duration.match(
                /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/,
              );
              if (match) {
                const hours = parseInt(match[1] || '0');
                const minutes = parseInt(match[2] || '0');
                const seconds = parseInt(match[3] || '0');
                durationMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
              }
            }

            const songUpdateData = {
              title: video.snippet.title,
              artist_name_on_platform: video.snippet.channelTitle,
              album_name: null,
              url: `https://www.youtube.com/watch?v=${video.id}`,
              cover_image_url:
                video.snippet.thumbnails?.medium?.url ||
                video.snippet.thumbnails?.default?.url ||
                null,
              duration_ms: durationMs,
              is_visible: true,
              deleted: false, // Restore if previously deleted
              updated_at: new Date(),
            };

            if (existingSong) {
              // Update existing song
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

              updatedVideos.push(updatedSong);
            } else {
              const newSong = await this.prismaService.song.create({
                data: {
                  song_id: require('uuid').v4(),
                  artist_id: userId,
                  platform_id: youtubePlatform.platform_id,
                  platform_specific_id: video.id,
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

              importedVideos.push(newSong);
            }
          } catch (error) {
            console.error(`Failed to import/update video ${video.id}:`, error);
            failedVideos.push({
              id: video.id,
              title: video.snippet?.title || 'Unknown',
              reason: 'Import/update failed',
            });
          }
        }
      } catch (error) {
        console.error(`Failed to fetch video chunk:`, error);
        chunk.forEach((videoId) => {
          failedVideos.push({
            id: videoId,
            title: 'Unknown',
            reason: 'Fetch failed',
          });
        });
      }

      if (i + chunkSize < videoIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return {
      imported: importedVideos,
      updated: updatedVideos,
      failed: failedVideos,
      message: `Successfully imported ${importedVideos.length} video(s) and updated ${updatedVideos.length} video(s). ${failedVideos.length} video(s) failed.`,
    };
  }

  async syncUserPlaylists(userId: string): Promise<any> {
    const youtubePlatform = await this.prismaService.platform.findFirst({
      where: { name: 'YouTube' },
    });

    if (!youtubePlatform) {
      throw new NotFoundException('YouTube platform not found in database');
    }

    const linkedAccount = await this.prismaService.linkedAccount.findFirst({
      where: {
        user_id: userId,
        platform_id: youtubePlatform.platform_id,
      },
    });

    if (!linkedAccount) {
      throw new NotFoundException('YouTube account not linked for this user');
    }

    if (
      linkedAccount.token_expires_at &&
      linkedAccount.token_expires_at < new Date()
    ) {
      const refreshedAccount = await this.refreshAccessToken(
        userId,
        youtubePlatform.platform_id,
      );
      linkedAccount.access_token = refreshedAccount.access_token;
    }

    const existingPlaylists = await this.prismaService.playlist.findMany({
      where: {
        creator_id: userId,
        platform_id: youtubePlatform.platform_id,
        deleted: false,
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

    if (existingPlaylists.length === 0) {
      return {
        updated: [],
        errors: [],
        message: 'No existing playlists found to sync',
      };
    }

    const playlistIds = existingPlaylists.map((p) => p.platform_specific_id);
    const headers = {
      Authorization: `Bearer ${linkedAccount.access_token}`,
    };

    const youtubePlaylists: any = { items: [] };
    try {
      const chunkSize = 50;
      for (let i = 0; i < playlistIds.length; i += chunkSize) {
        const chunk = playlistIds.slice(i, i + chunkSize);
        const params = new URLSearchParams({
          part: 'snippet,contentDetails',
          id: chunk.join(','),
          key: this.apiKey,
        });

        const response = await firstValueFrom(
          this.httpService
            .get(
              `https://www.googleapis.com/youtube/v3/playlists?${params.toString()}`,
              { headers },
            )
            .pipe(
              catchError((error) => {
                throw new BadRequestException(
                  `Failed to fetch YouTube playlists: ${error.response?.data?.error?.message || error.message}`,
                );
              }),
            ),
        );
        const data = response.data;

        youtubePlaylists.items = youtubePlaylists.items.concat(
          data.items || [],
        );
      }
    } catch (error) {
      return {
        updated: [],
        errors: [`Failed to fetch playlists from YouTube: ${error.message}`],
        message: 'Failed to sync playlists due to API error',
      };
    }

    const updatedPlaylists: any[] = [];
    const errors: string[] = [];

    for (const existingPlaylist of existingPlaylists) {
      try {
        const youtubePlaylist = youtubePlaylists.items.find(
          (yp: any) => yp.id === existingPlaylist.platform_specific_id,
        );

        if (youtubePlaylist) {
          const updatedPlaylist = await this.prismaService.playlist.update({
            where: { playlist_id: existingPlaylist.playlist_id },
            data: {
              name: youtubePlaylist.snippet.title,
              description: youtubePlaylist.snippet.description || null,
              url: `https://www.youtube.com/playlist?list=${youtubePlaylist.id}`,
              cover_image_url:
                youtubePlaylist.snippet.thumbnails?.medium?.url ||
                youtubePlaylist.snippet.thumbnails?.default?.url ||
                null,
              track_count: youtubePlaylist.contentDetails?.itemCount || 0,
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
        } else {
          // Playlist no longer exists on YouTube, but we don't delete it
          // just log it as an error for the user to know
          errors.push(
            `Playlist "${existingPlaylist.name}" no longer exists on YouTube`,
          );
        }
      } catch (error) {
        console.error(
          `Failed to update playlist ${existingPlaylist.playlist_id}:`,
          error,
        );
        errors.push(
          `Failed to update playlist "${existingPlaylist.name}": ${error.message}`,
        );
      }
    }

    return {
      updated: updatedPlaylists,
      errors,
      message: `Successfully updated ${updatedPlaylists.length} playlist(s). ${errors.length} error(s) occurred.`,
    };
  }

  async syncUserTracks(userId: string): Promise<any> {
    const youtubePlatform = await this.prismaService.platform.findFirst({
      where: { name: 'YouTube' },
    });

    if (!youtubePlatform) {
      throw new NotFoundException('YouTube platform not found in database');
    }

    const linkedAccount = await this.prismaService.linkedAccount.findFirst({
      where: {
        user_id: userId,
        platform_id: youtubePlatform.platform_id,
      },
    });

    if (!linkedAccount) {
      throw new NotFoundException('YouTube account not linked for this user');
    }

    if (
      linkedAccount.token_expires_at &&
      linkedAccount.token_expires_at < new Date()
    ) {
      const refreshedAccount = await this.refreshAccessToken(
        userId,
        youtubePlatform.platform_id,
      );
      linkedAccount.access_token = refreshedAccount.access_token;
    }

    const existingSongs = await this.prismaService.song.findMany({
      where: {
        artist_id: userId,
        platform_id: youtubePlatform.platform_id,
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

    const headers = {
      Authorization: `Bearer ${linkedAccount.access_token}`,
    };

    const updatedSongs: any[] = [];
    const syncErrors: any[] = [];

    const videoIds = existingSongs.map((song) => song.platform_specific_id);

    const chunkSize = 50;
    for (let i = 0; i < videoIds.length; i += chunkSize) {
      const chunk = videoIds.slice(i, i + chunkSize);

      try {
        const params = new URLSearchParams({
          part: 'snippet,contentDetails',
          id: chunk.join(','),
          key: this.apiKey,
        });

        const response = await firstValueFrom(
          this.httpService
            .get(
              `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
              { headers },
            )
            .pipe(
              catchError((error) => {
                throw new BadRequestException(
                  `Failed to fetch YouTube videos: ${error.response?.data?.error?.message || error.message}`,
                );
              }),
            ),
        );
        const videosData = response.data;

        for (const video of videosData.items || []) {
          if (!video) continue;

          try {
            const existingSong = existingSongs.find(
              (song) => song.platform_specific_id === video.id,
            );
            if (existingSong) {
              let durationMs: number | null = null;
              if (video.contentDetails?.duration) {
                const duration = video.contentDetails.duration;
                const match = duration.match(
                  /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/,
                );
                if (match) {
                  const hours = parseInt(match[1] || '0');
                  const minutes = parseInt(match[2] || '0');
                  const seconds = parseInt(match[3] || '0');
                  durationMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
                }
              }

              const updatedSong = await this.prismaService.song.update({
                where: { song_id: existingSong.song_id },
                data: {
                  title: video.snippet.title,
                  artist_name_on_platform:
                    video.snippet.channelTitle || 'Unknown Artist',
                  album_name: null,
                  url: `https://www.youtube.com/watch?v=${video.id}`,
                  cover_image_url:
                    video.snippet.thumbnails?.medium?.url ||
                    video.snippet.thumbnails?.default?.url ||
                    null,
                  duration_ms: durationMs,
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
            console.error(`Failed to sync song ${video.id}:`, error);
            syncErrors.push({
              id: video.id,
              title: video.snippet?.title || 'Unknown',
              error: error.message,
            });
          }
        }
      } catch (error) {
        console.error(`Failed to fetch video chunk:`, error);
        chunk.forEach((videoId) => {
          const existingSong = existingSongs.find(
            (song) => song.platform_specific_id === videoId,
          );
          syncErrors.push({
            id: videoId,
            title: existingSong?.title || 'Unknown',
            error: error.message,
          });
        });
      }

      if (i + chunkSize < videoIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return {
      updated: updatedSongs,
      errors: syncErrors,
      message: `Successfully synced ${updatedSongs.length} song(s). ${syncErrors.length} error(s).`,
    };
  }
}
