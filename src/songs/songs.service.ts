import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSongDto, UpdateSongDto } from './dto/song.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SongsService {
    constructor(private readonly prismaService: PrismaService) { }    async findAll(skip = 0, take = 10) {
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
}
