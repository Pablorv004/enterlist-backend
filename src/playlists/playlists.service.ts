import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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
    ) { }

    async findAll(skip = 0, take = 10) {
        const [data, total] = await Promise.all([
            this.prismaService.playlist.findMany({
                skip,
                take,
                include: {
                    creator: {
                        select: {
                            username: true,
                            email: true,
                        },
                    },
                    platform: true,
                },
            }),
            this.prismaService.playlist.count(),
        ]);

        return { data, total, skip, take };
    }

    async findByCreator(creatorId: string, skip = 0, take = 10) {
        const [data, total] = await Promise.all([
            this.prismaService.playlist.findMany({
                where: { creator_id: creatorId },
                skip,
                take,
                include: {
                    platform: true,
                },
            }),
            this.prismaService.playlist.count({
                where: { creator_id: creatorId },
            }),
        ]);

        return { data, total, skip, take };
    }    async findOne(id: string) {
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
        // First, get the playlist to find its platform and external ID
        const playlist = await this.findOne(id);

        // Get the platform name to determine which service to use
        const platformName = playlist.platform?.name?.toLowerCase();

        if (platformName === 'spotify') {
            // Use Spotify service to get playlist tracks
            return this.spotifyAuthService.getPlaylistTracks(
                playlist.platform_specific_id,
                playlist.creator_id
            );
        } else if (platformName === 'youtube') {
            // Use YouTube service to get playlist tracks
            return this.youtubeAuthService.getPlaylistTracks(
                playlist.platform_specific_id,
                playlist.creator_id
            );
        } else {
            throw new NotFoundException(`Platform ${platformName} not supported for track fetching`);
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

        if (creator.role !== 'playlist_maker' && creator.role !== 'admin') {
            throw new ConflictException(`User must be a playlist maker to create playlists`);
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
            throw new ConflictException(`Playlist already exists for this platform and ID`);
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

        const submissionsCount = await this.prismaService.submission.count({
            where: { playlist_id: id },
        });

        if (submissionsCount > 0) {
            throw new ConflictException(
                `Cannot delete playlist with ID ${id} as it has ${submissionsCount} submissions`
            );
        }

        return this.prismaService.playlist.delete({
            where: { playlist_id: id },
        });
    }

    async importPlaylists(userId: string, platformId: number) {
        // Find the platform
        const platform = await this.prismaService.platform.findUnique({
            where: { platform_id: platformId },
        });

        if (!platform) {
            throw new NotFoundException(`Platform with ID ${platformId} not found`);
        }

        // Check if user has a linked account for this platform
        const linkedAccount = await this.prismaService.linkedAccount.findFirst({
            where: {
                user_id: userId,
                platform_id: platformId,
            },
        });

        if (!linkedAccount) {
            throw new NotFoundException(`No linked account found for platform ${platform.name}`);
        }        let externalPlaylists: any[] = [];
        const platformName = platform.name.toLowerCase();

        // Fetch playlists from the platform
        if (platformName === 'spotify') {
            const playlistData = await this.spotifyAuthService.getUserPlaylists(userId);
            externalPlaylists = Array.isArray(playlistData) ? playlistData : playlistData.items || [];
        } else if (platformName === 'youtube') {
            const playlistData = await this.youtubeAuthService.getUserPlaylists(userId);
            externalPlaylists = Array.isArray(playlistData) ? playlistData : playlistData.items || [];
        } else {
            throw new NotFoundException(`Platform ${platform.name} not supported for import`);
        }

        if (!externalPlaylists || externalPlaylists.length === 0) {
            return { imported: [], message: 'No playlists found to import' };
        }

        const importedPlaylists: any[] = [];
        const skippedPlaylists: any[] = [];

        // Process each playlist
        for (const externalPlaylist of externalPlaylists) {
            try {
                // Check if playlist already exists
                const existingPlaylist = await this.prismaService.playlist.findFirst({
                    where: {
                        platform_id: platformId,
                        platform_specific_id: externalPlaylist.id,
                    },
                });

                if (existingPlaylist) {
                    skippedPlaylists.push({
                        id: externalPlaylist.id,
                        name: externalPlaylist.name || externalPlaylist.snippet?.title,
                        reason: 'Already exists'
                    });
                    continue;
                }                // Create playlist data based on platform
                const playlistData: CreatePlaylistDto = {
                    creator_id: userId,
                    platform_id: platformId,
                    platform_specific_id: externalPlaylist.id,
                    name: externalPlaylist.name || externalPlaylist.snippet?.title || 'Untitled Playlist',
                    description: externalPlaylist.description || externalPlaylist.snippet?.description || undefined,
                    url: this.getPlaylistUrl(externalPlaylist, platformName) || undefined,
                    cover_image_url: this.getPlaylistCoverImage(externalPlaylist, platformName) || undefined,
                    is_visible: true, // Default to visible
                    genre: undefined,
                    follower_count: this.getFollowerCount(externalPlaylist, platformName) || undefined,
                    submission_fee: 0, // Default fee
                };                // Create the playlist
                const newPlaylist = await this.prismaService.playlist.create({
                    data: {
                        playlist_id: uuidv4(),
                        creator_id: userId,
                        platform_id: platformId,
                        platform_specific_id: externalPlaylist.id,
                        name: externalPlaylist.name || externalPlaylist.snippet?.title || 'Untitled Playlist',
                        description: externalPlaylist.description || externalPlaylist.snippet?.description || undefined,
                        url: this.getPlaylistUrl(externalPlaylist, platformName) || undefined,
                        cover_image_url: this.getPlaylistCoverImage(externalPlaylist, platformName) || undefined,
                        is_visible: true,
                        genre: undefined,
                        follower_count: this.getFollowerCount(externalPlaylist, platformName) || undefined,
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
                console.error(`Failed to import playlist ${externalPlaylist.id}:`, error);
                skippedPlaylists.push({
                    id: externalPlaylist.id,
                    name: externalPlaylist.name || externalPlaylist.snippet?.title,
                    reason: 'Import failed'
                });
            }
        }

        return {
            imported: importedPlaylists,
            skipped: skippedPlaylists,
            message: `Successfully imported ${importedPlaylists.length} playlist(s). ${skippedPlaylists.length} playlist(s) were skipped.`
        };
    }    private getPlaylistUrl(playlist: any, platformName: string): string | undefined {
        if (platformName === 'spotify') {
            return playlist.external_urls?.spotify || undefined;
        } else if (platformName === 'youtube') {
            return `https://www.youtube.com/playlist?list=${playlist.id}`;
        }
        return undefined;
    }

    private getPlaylistCoverImage(playlist: any, platformName: string): string | undefined {
        if (platformName === 'spotify') {
            return playlist.images?.[0]?.url || undefined;
        } else if (platformName === 'youtube') {
            return playlist.snippet?.thumbnails?.medium?.url || 
                   playlist.snippet?.thumbnails?.default?.url || undefined;
        }
        return undefined;
    }

    private getFollowerCount(playlist: any, platformName: string): number | undefined {
        if (platformName === 'spotify') {
            return playlist.followers?.total || 0;
        }
        // YouTube doesn't provide follower count for playlists in the same way
        return 0;
    }
}
