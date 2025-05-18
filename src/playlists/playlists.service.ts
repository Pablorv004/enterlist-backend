import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlaylistDto, UpdatePlaylistDto } from './dto/playlist.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PlaylistsService {
    constructor(private readonly prismaService: PrismaService) { }

    async findAll(skip = 0, take = 10) {
        const [playlists, count] = await Promise.all([
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

        return { playlists, count, skip, take };
    }

    async findByCreator(creatorId: string, skip = 0, take = 10) {
        const [playlists, count] = await Promise.all([
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

        return { playlists, count, skip, take };
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
}
