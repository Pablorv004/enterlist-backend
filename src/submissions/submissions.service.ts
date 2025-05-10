import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubmissionDto, UpdateSubmissionDto } from './dto/submission.dto';
import { v4 as uuidv4 } from 'uuid';
import { submission_status } from '@prisma/client';

@Injectable()
export class SubmissionsService {
    constructor(private readonly prismaService: PrismaService) { }

    async findAll(skip = 0, take = 10, status?: submission_status) {
        const where = status ? { status } : {};

        const [submissions, count] = await Promise.all([
            this.prismaService.submission.findMany({
                where,
                skip,
                take,
                include: {
                    artist: {
                        select: {
                            username: true,
                            email: true,
                        },
                    },
                    playlist: {
                        select: {
                            name: true,
                            creator: {
                                select: {
                                    username: true,
                                },
                            },
                        },
                    },
                    song: {
                        select: {
                            title: true,
                            artist_name_on_platform: true,
                        },
                    },
                },
                orderBy: { submitted_at: 'desc' },
            }),
            this.prismaService.submission.count({ where }),
        ]);

        return { submissions, count, skip, take };
    }

    async findByArtist(artistId: string, skip = 0, take = 10) {
        const [submissions, count] = await Promise.all([
            this.prismaService.submission.findMany({
                where: { artist_id: artistId },
                skip,
                take,
                include: {
                    playlist: {
                        select: {
                            name: true,
                            creator: {
                                select: {
                                    username: true,
                                },
                            },
                        },
                    },
                    song: {
                        select: {
                            title: true,
                            artist_name_on_platform: true,
                        },
                    },
                },
                orderBy: { submitted_at: 'desc' },
            }),
            this.prismaService.submission.count({ where: { artist_id: artistId } }),
        ]);

        return { submissions, count, skip, take };
    }

    async findByPlaylist(playlistId: string, skip = 0, take = 10) {
        const [submissions, count] = await Promise.all([
            this.prismaService.submission.findMany({
                where: { playlist_id: playlistId },
                skip,
                take,
                include: {
                    artist: {
                        select: {
                            username: true,
                        },
                    },
                    song: {
                        select: {
                            title: true,
                            artist_name_on_platform: true,
                            url: true,
                            cover_image_url: true,
                        },
                    },
                },
                orderBy: { submitted_at: 'desc' },
            }),
            this.prismaService.submission.count({ where: { playlist_id: playlistId } }),
        ]);

        return { submissions, count, skip, take };
    }

    async findOne(id: string) {
        const submission = await this.prismaService.submission.findUnique({
            where: { submission_id: id },
            include: {
                artist: {
                    select: {
                        user_id: true,
                        username: true,
                        email: true,
                    },
                },
                playlist: {
                    select: {
                        playlist_id: true,
                        name: true,
                        creator: {
                            select: {
                                user_id: true,
                                username: true,
                            },
                        },
                    },
                },
                song: {
                    select: {
                        song_id: true,
                        title: true,
                        artist_name_on_platform: true,
                        url: true,
                        cover_image_url: true,
                    },
                },
                transaction: true,
            },
        });

        if (!submission) {
            throw new NotFoundException(`Submission with ID ${id} not found`);
        }

        return submission;
    }

    async create(createSubmissionDto: CreateSubmissionDto) {
        const { artist_id, playlist_id, song_id } = createSubmissionDto;

        const artist = await this.prismaService.user.findUnique({
            where: { user_id: artist_id },
        });

        if (!artist) {
            throw new NotFoundException(`Artist with ID ${artist_id} not found`);
        }

        if (artist.role !== 'artist' && artist.role !== 'admin') {
            throw new ConflictException(`User must be an artist to submit songs`);
        }

        const playlist = await this.prismaService.playlist.findUnique({
            where: { playlist_id },
        });

        if (!playlist) {
            throw new NotFoundException(`Playlist with ID ${playlist_id} not found`);
        }

        const song = await this.prismaService.song.findUnique({
            where: { song_id },
        });

        if (!song) {
            throw new NotFoundException(`Song with ID ${song_id} not found`);
        }

        if (song.artist_id !== artist_id && artist.role !== 'admin') {
            throw new ConflictException(`Song does not belong to this artist`);
        }

        const existingSubmission = await this.prismaService.submission.findFirst({
            where: {
                artist_id,
                playlist_id,
                song_id,
            },
        });

        if (existingSubmission) {
            throw new ConflictException(
                `Submission already exists for this artist, playlist, and song`
            );
        }

        return this.prismaService.submission.create({
            data: {
                submission_id: uuidv4(),
                ...createSubmissionDto,
                status: submission_status.pending,
                submitted_at: new Date(),
            },
            include: {
                artist: {
                    select: {
                        username: true,
                    },
                },
                playlist: {
                    select: {
                        name: true,
                    },
                },
                song: {
                    select: {
                        title: true,
                    },
                },
            },
        });
    }

    async update(id: string, updateSubmissionDto: UpdateSubmissionDto) {
        await this.findOne(id);

        const data = { ...updateSubmissionDto };
        if (updateSubmissionDto.status && !updateSubmissionDto.reviewed_at) {
            data.reviewed_at = new Date();
        }

        return this.prismaService.submission.update({
            where: { submission_id: id },
            data,
            include: {
                artist: {
                    select: {
                        username: true,
                    },
                },
                playlist: {
                    select: {
                        name: true,
                    },
                },
                song: {
                    select: {
                        title: true,
                    },
                },
            },
        });
    }

    async remove(id: string) {
        const submission = await this.findOne(id);

        if (submission.transaction) {
            throw new ConflictException(
                `Cannot delete submission with ID ${id} as it has a transaction attached`
            );
        }

        return this.prismaService.submission.delete({
            where: { submission_id: id },
        });
    }
}

