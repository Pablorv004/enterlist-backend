import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSongDto, UpdateSongDto } from './dto/song.dto';
import { SpotifyAuthService } from '../spotify-auth/spotify-auth.service';
import { YoutubeAuthService } from '../youtube-auth/youtube-auth.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SongsService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly spotifyAuthService: SpotifyAuthService,
        private readonly youtubeAuthService: YoutubeAuthService,
    ) { }async findAll(skip = 0, take = 10) {
        const [data, total] = await Promise.all([
            this.prismaService.song.findMany({                where: {
                    deleted: false,
                },
                skip,
                take,
                include: {
                    artist: {
                        select: {
                            username: true,
                            email: true,
                        },
                    },
                    platform: true,
                },
            }),
            this.prismaService.song.count({
                where: {
                    deleted: false,
                },
            }),
        ]);

        return { data, total, skip, take };
    }    async findByArtist(artistId: string, skip = 0, take = 10) {
        const [data, total] = await Promise.all([
            this.prismaService.song.findMany({
                where: { 
                    artist_id: artistId,
                    deleted: false,
                },
                skip,
                take,
                include: {
                    platform: true,
                },
            }),            this.prismaService.song.count({
                where: { 
                    artist_id: artistId,
                    deleted: false,
                },
            }),
        ]);

        return { data, total, skip, take };
    }

    async findOne(id: string) {
        const song = await this.prismaService.song.findUnique({
            where: { song_id: id },
            include: {
                artist: {
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
                        playlist: {
                            select: {
                                playlist_id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        if (!song) {
            throw new NotFoundException(`Song with ID ${id} not found`);
        }

        return song;
    }

    async create(createSongDto: CreateSongDto) {
        const { artist_id, platform_id, platform_specific_id } = createSongDto;

        const artist = await this.prismaService.user.findUnique({
            where: { user_id: artist_id },
        });

        if (!artist) {
            throw new NotFoundException(`User with ID ${artist_id} not found`);
        }

        if (artist.role !== 'artist' && artist.role !== 'admin') {
            throw new ConflictException(`User must be an artist to create songs`);
        }

        const platform = await this.prismaService.platform.findUnique({
            where: { platform_id },
        });

        if (!platform) {
            throw new NotFoundException(`Platform with ID ${platform_id} not found`);
        }

        const existingSong = await this.prismaService.song.findFirst({
            where: {
                platform_id,
                platform_specific_id,
            },
        });

        if (existingSong) {
            throw new ConflictException(`Song already exists for this platform and ID`);
        }

        return this.prismaService.song.create({
            data: {
                song_id: uuidv4(),
                ...createSongDto,
                created_at: new Date(),
                updated_at: new Date(),
            },
            include: {
                artist: {
                    select: {
                        username: true,
                    },
                },
                platform: true,
            },
        });
    }

    async update(id: string, updateSongDto: UpdateSongDto) {
        await this.findOne(id);

        return this.prismaService.song.update({
            where: { song_id: id },
            data: {
                ...updateSongDto,
                updated_at: new Date(),
            },
            include: {
                artist: {
                    select: {
                        username: true,
                    },
                },
                platform: true,
            },
        });
    }    async remove(id: string) {
        await this.findOne(id);

        // Soft delete: set deleted to true instead of actually deleting the record
        return this.prismaService.song.update({
            where: { song_id: id },
            data: {
                deleted: true,
                updated_at: new Date(),
            },
            include: {
                artist: {
                    select: {
                        username: true,
                    },
                },
                platform: true,
            },
        });
    }

    // Sync songs - orchestrates sync across all connected platforms
    async syncSongs(artistId: string): Promise<any> {
        const results: {
            spotify: any;
            youtube: any;
            totalUpdated: number;
            totalErrors: number;
            message: string;
            errors: string[];
        } = {
            spotify: null,
            youtube: null,
            totalUpdated: 0,
            totalErrors: 0,
            message: '',
            errors: []
        };

        // Get user's linked accounts to determine which platforms to sync
        const linkedAccounts = await this.prismaService.linkedAccount.findMany({
            where: { user_id: artistId },
            include: { platform: true }
        });

        const syncPromises: Promise<any>[] = [];

        // Check for Spotify sync
        const spotifyAccount = linkedAccounts.find(acc => acc.platform.name === 'Spotify');
        if (spotifyAccount) {
            syncPromises.push(
                this.spotifyAuthService.syncUserTracks(artistId)
                    .then(result => {
                        results.spotify = result;
                        results.totalUpdated += result.updated?.length || 0;
                        results.totalErrors += result.errors?.length || 0;
                        return result;
                    })
                    .catch(error => {
                        const errorMsg = `Spotify sync failed: ${error.message}`;
                        results.errors.push(errorMsg);
                        results.totalErrors++;
                        results.spotify = { updated: [], errors: [errorMsg], message: errorMsg };
                        return results.spotify;
                    })
            );
        }

        // Check for YouTube sync
        const youtubeAccount = linkedAccounts.find(acc => acc.platform.name === 'YouTube');
        if (youtubeAccount) {
            syncPromises.push(
                this.youtubeAuthService.syncUserTracks(artistId)
                    .then(result => {
                        results.youtube = result;
                        results.totalUpdated += result.updated?.length || 0;
                        results.totalErrors += result.errors?.length || 0;
                        return result;
                    })
                    .catch(error => {
                        const errorMsg = `YouTube sync failed: ${error.message}`;
                        results.errors.push(errorMsg);
                        results.totalErrors++;
                        results.youtube = { updated: [], errors: [errorMsg], message: errorMsg };
                        return results.youtube;
                    })
            );
        }

        // If no platforms are linked, return early
        if (syncPromises.length === 0) {
            return {
                ...results,
                message: 'No connected platforms found to sync'
            };
        }

        // Wait for all sync operations to complete
        await Promise.all(syncPromises);

        // Compile overall message
        const platformResults: string[] = [];
        if (results.spotify) {
            platformResults.push(`Spotify: ${results.spotify.updated?.length || 0} updated`);
        }
        if (results.youtube) {
            platformResults.push(`YouTube: ${results.youtube.updated?.length || 0} updated`);
        }

        results.message = `Sync completed. ${platformResults.join(', ')}. Total: ${results.totalUpdated} songs updated`;
        
        if (results.totalErrors > 0) {
            results.message += `. ${results.totalErrors} error(s) occurred`;
        }

        return results;
    }
}
