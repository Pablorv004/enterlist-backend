import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlaylistDto, UpdatePlaylistDto } from './dto/playlist.dto';
import { SpotifyAuthService } from '../spotify-auth/spotify-auth.service';
import { YoutubeAuthService } from '../youtube-auth/youtube-auth.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PlaylistsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly spotifyAuthService: SpotifyAuthService,
    private readonly youtubeAuthService: YoutubeAuthService,
  ) {}
  async findAll(skip = 0, take = 10) {
    const [data, total] = await Promise.all([
      this.prismaService.playlist.findMany({
        where: {
          is_visible: true,
          deleted: false,
        },
        skip,
        take,
        include: {
          creator: {
            select: {
              user_id: true,
              username: true,
              email: true,
            },
          },
          platform: true,
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prismaService.playlist.count({
        where: {
          is_visible: true,
          deleted: false,
        },
      }),
    ]);

    return { data, total, skip, take };
  }
  async findByCreator(creatorId: string, skip = 0, take = 10) {
    const [data, total] = await Promise.all([
      this.prismaService.playlist.findMany({
        where: {
          creator_id: creatorId,
          deleted: false,
        },
        skip,
        take,
        include: {
          creator: {
            select: {
              user_id: true,
              username: true,
              email: true,
            },
          },
          platform: true,
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prismaService.playlist.count({
        where: {
          creator_id: creatorId,
          deleted: false,
        },
      }),
    ]);
    return { data, total, skip, take };
  }
  async findByPlatform(platformId: number, skip = 0, take = 50) {
    const [data, total] = await Promise.all([
      this.prismaService.playlist.findMany({
        where: {
          platform_id: platformId,
          is_visible: true,
          deleted: false,
        },
        skip,
        take,
        include: {
          creator: {
            select: {
              user_id: true,
              username: true,
              email: true,
            },
          },
          platform: true,
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prismaService.playlist.count({
        where: {
          platform_id: platformId,
          is_visible: true,
          OR: [{ deleted: null }, { deleted: false }],
        },
      }),
    ]);

    return { data, total, skip, take };
  }

  async findOne(id: string) {
    const playlist = await this.prismaService.playlist.findUnique({
      where: { playlist_id: id },
      include: {
        creator: {
          select: {
            user_id: true,
            username: true,
            email: true,
            role: true,
          },
        },
        platform: true,
        submissions: {
          select: {
            submission_id: true,
            status: true,
            submitted_at: true,
            song: {
              select: {
                song_id: true,
                title: true,
                artist_name_on_platform: true,
              },
            },
          },
        },
      },
    });

    if (!playlist) {
      throw new NotFoundException(`Playlist with ID ${id} not found`);
    }

    return playlist;
  }

  async getPlaylistTracks(id: string) {
    const playlist = await this.findOne(id);

    const platformName = playlist.platform?.name?.toLowerCase();

    if (platformName === 'spotify') {
      return this.spotifyAuthService.getPlaylistTracks(
        playlist.platform_specific_id,
        playlist.creator_id,
      );
    } else if (platformName === 'youtube') {
      return this.youtubeAuthService.getPlaylistTracks(
        playlist.platform_specific_id,
        playlist.creator_id,
      );
    } else {
      throw new NotFoundException(
        `Platform ${platformName} not supported for track fetching`,
      );
    }
  }

  async create(createPlaylistDto: CreatePlaylistDto) {
    const { creator_id, platform_id, platform_specific_id } = createPlaylistDto;

    const creator = await this.prismaService.user.findUnique({
      where: { user_id: creator_id },
    });

    if (!creator) {
      throw new NotFoundException(`User with ID ${creator_id} not found`);
    }

    const platform = await this.prismaService.platform.findUnique({
      where: { platform_id },
    });

    if (!platform) {
      throw new NotFoundException(`Platform with ID ${platform_id} not found`);
    }

    const existingPlaylist = await this.prismaService.playlist.findFirst({
      where: {
        platform_id,
        platform_specific_id,
      },
    });

    if (existingPlaylist) {
      throw new ConflictException(
        `Playlist already exists for this platform and ID`,
      );
    }

    return this.prismaService.playlist.create({
      data: {
        playlist_id: uuidv4(),
        ...createPlaylistDto,
        submission_fee: createPlaylistDto.submission_fee || 0,
        created_at: new Date(),
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
  }

  async update(id: string, updatePlaylistDto: UpdatePlaylistDto) {
    await this.findOne(id);

    return this.prismaService.playlist.update({
      where: { playlist_id: id },
      data: {
        ...updatePlaylistDto,
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
  }
  async remove(id: string) {
    await this.findOne(id);

    // Soft delete: set deleted to true instead of actually deleting the record
    return this.prismaService.playlist.update({
      where: { playlist_id: id },
      data: {
        deleted: true,
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
  }
  // Sync playlists - orchestrates sync across all connected platforms
  async syncPlaylists(userId: string): Promise<any> {
    // Get user's linked accounts to determine which platforms to sync
    const linkedAccounts = await this.prismaService.linkedAccount.findMany({
      where: { user_id: userId },
      include: { platform: true },
    });

    const syncPromises: Promise<any>[] = [];
    let hasErrors = false;

    // Check for Spotify sync
    const spotifyAccount = linkedAccounts.find(
      (acc) => acc.platform.name === 'Spotify',
    );
    if (spotifyAccount) {
      syncPromises.push(
        this.spotifyAuthService.syncUserPlaylists(userId).catch((error) => {
          console.error('Spotify sync failed:', error);
          hasErrors = true;
        }),
      );
    }

    // Check for YouTube sync
    const youtubeAccount = linkedAccounts.find(
      (acc) => acc.platform.name === 'YouTube',
    );
    if (youtubeAccount) {
      syncPromises.push(
        this.youtubeAuthService.syncUserPlaylists(userId).catch((error) => {
          console.error('YouTube sync failed:', error);
          hasErrors = true;
        }),
      );
    }

    // If no platforms are linked, return early
    if (syncPromises.length === 0) {
      return {
        success: false,
        message: 'No connected platforms found to sync',
      };
    }

    // Wait for all sync operations to complete
    await Promise.all(syncPromises);

    return {
      success: !hasErrors,
      message: hasErrors ? 'Sync completed with some errors' : 'Sync complete!',
    };
  }
}
