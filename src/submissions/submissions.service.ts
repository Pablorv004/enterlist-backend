import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreateSubmissionDto, UpdateSubmissionDto } from './dto/submission.dto';
import { v4 as uuidv4 } from 'uuid';
import { submission_status } from '@prisma/client';

@Injectable()
export class SubmissionsService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly emailService: EmailService
    ) { }

    async findAll(skip = 0, take = 10, status?: submission_status) {
        const where = status ? { status } : {};

        const [data, total] = await Promise.all([
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

        return { data, total, skip, take };
    }    async findByArtist(artistId: string, skip = 0, take = 10) {
        const [data, total] = await Promise.all([
            this.prismaService.submission.findMany({
                where: { artist_id: artistId },
                skip,
                take,
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
                },
                orderBy: { submitted_at: 'desc' },
            }),
            this.prismaService.submission.count({ where: { artist_id: artistId } }),
        ]);

        return { data, total, skip, take };
    }    async findByPlaylist(playlistId: string, skip = 0, take = 10, status?: submission_status) {
        const [data, total] = await Promise.all([
            this.prismaService.submission.findMany({
                where: { playlist_id: playlistId, ...(status ? { status } : {}) },
                skip,
                take,
                include: {
                    artist: {
                        select: {
                            user_id: true,
                            username: true,
                            email: true,
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
                },
                orderBy: { submitted_at: 'desc' },
            }),
            this.prismaService.submission.count({ where: { playlist_id: playlistId } }),
        ]);

        return { data, total, skip, take };
    }    async findByCreator(creatorId: string, skip = 0, take = 10, status?: submission_status, playlistId?: string, artistId?: string) {
        const where: any = { 
            playlist: { creator_id: creatorId } 
        };

        // Add status filter if provided
        if (status) {
            where.status = status;
        }

        // Add playlist filter if provided
        if (playlistId) {
            where.playlist_id = playlistId;
        }

        // Add artist filter if provided
        if (artistId) {
            where.artist_id = artistId;
        }

        const [data, total] = await Promise.all([
            this.prismaService.submission.findMany({
                where,
                skip,
                take,
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
                },
                orderBy: { submitted_at: 'desc' },
            }),
            this.prismaService.submission.count({ where }),
        ]);

        return { data, total, skip, take };
    }

    async findOne(id: string) {
        const data = await this.prismaService.submission.findUnique({
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

        if (!data) {
            throw new NotFoundException(`Submission with ID ${id} not found`);
        }

        return data;
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
        }        return this.prismaService.submission.create({
            data: {
                submission_id: uuidv4(),
                ...createSubmissionDto,
                status: submission_status.pending,
                submitted_at: new Date(),
            },            include: {
                artist: {
                    select: {
                        username: true,
                        email: true,
                    },
                },
                playlist: {
                    select: {
                        name: true,
                        submission_fee: true,
                        creator: {
                            select: {
                                username: true,
                                email: true,
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
            },}).then(async (submission) => {
            // Send email notifications
            try {                // Send receipt to artist
                await this.emailService.sendSubmissionReceipt(
                    submission.artist.email,
                    submission.artist.username,
                    submission.song.title,
                    submission.playlist.name,
                    submission.playlist.submission_fee.toString(),
                    submission.submission_id
                );

                // Send notification to playlist creator
                await this.emailService.sendSubmissionNotification(
                    submission.playlist.creator.email,
                    submission.playlist.creator.username,
                    submission.song.title,
                    submission.artist.username,
                    submission.playlist.name,
                    submission.submission_id
                );
            } catch (emailError) {
                console.error('Failed to send submission emails:', emailError);
                // Don't fail the submission if emails fail
            }

            return submission;
        });
    }    async update(id: string, updateSubmissionDto: UpdateSubmissionDto) {
        const existingSubmission = await this.findOne(id);

        const data = { ...updateSubmissionDto };
        if (updateSubmissionDto.status && !updateSubmissionDto.reviewed_at) {
            data.reviewed_at = new Date();
        }

        const updatedSubmission = await this.prismaService.submission.update({
            where: { submission_id: id },
            data,
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
                    },
                },
                song: {
                    select: {
                        title: true,
                    },
                },
            },
        });

        // Send email notification if status changed to approved or rejected
        if (updateSubmissionDto.status && 
            updateSubmissionDto.status !== existingSubmission.status &&
            (updateSubmissionDto.status === 'approved' || updateSubmissionDto.status === 'rejected')) {
            try {
                await this.emailService.sendSubmissionStatusUpdate(
                    updatedSubmission.artist.email,
                    updatedSubmission.artist.username,
                    updatedSubmission.song.title,
                    updatedSubmission.playlist.name,
                    updateSubmissionDto.status,
                    updateSubmissionDto.review_feedback
                );
            } catch (emailError) {
                console.error('Failed to send submission status update email:', emailError);
                // Don't fail the update if email fails
            }
        }

        return updatedSubmission;
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
    }    async getSubmissionStatsByCreator(creatorId: string) {
        const stats = await this.prismaService.submission.groupBy({
            by: ['playlist_id', 'status'],
            where: {
                playlist: {
                    creator_id: creatorId
                }
            },
            _count: {
                submission_id: true
            }
        });

        // Also get total earnings per playlist
        const earnings = await this.prismaService.transaction.groupBy({
            by: ['submission_id'],
            where: {
                submission: {
                    playlist: {
                        creator_id: creatorId
                    }
                },
                status: 'succeeded'
            },
            _sum: {
                creator_payout_amount: true
            }
        });

        // Organize the data by playlist
        const playlistStats: Record<string, any> = {};

        // Process submission counts by status
        stats.forEach(stat => {
            if (!playlistStats[stat.playlist_id]) {
                playlistStats[stat.playlist_id] = {
                    submissions: 0,
                    pending: 0,
                    approved: 0,
                    rejected: 0,
                    earnings: 0
                };
            }

            playlistStats[stat.playlist_id].submissions += stat._count.submission_id;
            playlistStats[stat.playlist_id][stat.status] = stat._count.submission_id;
        });

        // Process earnings (we'll need to join with submissions to get playlist_id)
        const submissionEarnings = await this.prismaService.submission.findMany({
            where: {
                playlist: {
                    creator_id: creatorId
                },
                transaction: {
                    status: 'succeeded'
                }
            },
            include: {
                transaction: {
                    select: {
                        creator_payout_amount: true
                    }
                }
            }
        });

        submissionEarnings.forEach(submission => {
            if (playlistStats[submission.playlist_id] && submission.transaction) {
                playlistStats[submission.playlist_id].earnings += submission.transaction.creator_payout_amount || 0;
            }
        });

        return playlistStats;
    }

    async getEarningsStatsByCreator(creatorId: string) {
        // Get the last 12 months of earnings data
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

        const earningsData = await this.prismaService.transaction.findMany({
            where: {
                submission: {
                    playlist: {
                        creator_id: creatorId
                    },
                    status: 'approved'
                },
                status: 'succeeded',
                created_at: {
                    gte: twelveMonthsAgo
                }
            },
            select: {
                creator_payout_amount: true,
                created_at: true
            },
            orderBy: {
                created_at: 'asc'
            }
        });

        // Group by month
        const monthlyEarnings: Record<string, number> = {};
        
        // Initialize all 12 months with 0
        for (let i = 11; i >= 0; i--) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const monthKey = date.toISOString().substring(0, 7); // YYYY-MM format
            monthlyEarnings[monthKey] = 0;
        }        // Aggregate earnings by month
        earningsData.forEach(transaction => {
            const monthKey = transaction.created_at.toISOString().substring(0, 7);
            const amount = Number(transaction.creator_payout_amount) || 0;
            monthlyEarnings[monthKey] += amount;
        });

        // Convert to array format with month names
        const result = Object.entries(monthlyEarnings).map(([monthKey, amount]) => {
            const date = new Date(monthKey + '-01');
            return {
                month: date.toLocaleDateString('en-US', { month: 'short' }),
                amount: Number(amount) // Keep as is since backend already stores in dollars
            };
        });

        return result;
    }
}

