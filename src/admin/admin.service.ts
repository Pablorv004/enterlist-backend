import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { submission_status, transaction_status } from '@prisma/client';

@Injectable()
export class AdminService {
    constructor(private readonly prismaService: PrismaService) { }

    async getStatistics() {
        // Get total counts
        const [
            totalUsers,
            totalPlaylists,
            totalSongs,
            totalSubmissions,
            totalTransactions,
            pendingWithdrawals
        ] = await Promise.all([
            this.prismaService.user.count({
                where: { 
                    is_active: true,
                    role: { not: 'admin' },
                    deleted: false
                }
            }),
            this.prismaService.playlist.count({
                where: { deleted: false }
            }),
            this.prismaService.song.count({
                where: { deleted: false }
            }),
            this.prismaService.submission.count({
                where: { deleted: false }
            }),
            this.prismaService.transaction.count({
                where: { deleted: false }
            }),
            this.prismaService.withdrawal.count({
                where: { 
                    status: 'pending',
                    deleted: false 
                }
            })
        ]);

        // Get users registered per month (last 12 months)
        const usersPerMonth = await this.prismaService.$queryRaw`
            SELECT 
                DATE_TRUNC('month', created_at) as month,
                COUNT(*) as count
            FROM users
            WHERE created_at >= NOW() - INTERVAL '12 months'
                AND is_active = true AND role != 'admin' AND deleted = false
            GROUP BY DATE_TRUNC('month', created_at)
            ORDER BY month DESC
            LIMIT 12
        `.then((result: any[]) => result.map(row => ({
            ...row,
            count: Number(row.count)
        })));

        // Get playlists by genre
        const playlistsByGenre = await this.prismaService.playlist.groupBy({
            by: ['genre'],
            where: {
                deleted: false,
                genre: { not: null }
            },
            _count: {
                playlist_id: true
            },
            orderBy: {
                _count: {
                    playlist_id: 'desc'
                }
            },
            take: 10
        });

        // Get users by role (excluding admins)
        const usersByRole = await this.prismaService.user.groupBy({
            by: ['role'],
            where: {
                is_active: true,
                role: { not: 'admin' },
                deleted: false
            },
            _count: {
                user_id: true
            }
        });

        // Get submissions per month (last 12 months)
        const submissionsPerMonth = await this.prismaService.$queryRaw`
            SELECT 
                DATE_TRUNC('month', submitted_at) as month,
                COUNT(*) as count
            FROM submissions
            WHERE submitted_at >= NOW() - INTERVAL '12 months'
                AND deleted = false
            GROUP BY DATE_TRUNC('month', submitted_at)
            ORDER BY month DESC
            LIMIT 12
        `.then((result: any[]) => result.map(row => ({
            ...row,
            count: Number(row.count)
        })));

        // Get playlists created per month (last 12 months)
        const playlistsPerMonth = await this.prismaService.$queryRaw`
            SELECT 
                DATE_TRUNC('month', created_at) as month,
                COUNT(*) as count
            FROM playlists
            WHERE created_at >= NOW() - INTERVAL '12 months'
                AND deleted = false
            GROUP BY DATE_TRUNC('month', created_at)
            ORDER BY month DESC
            LIMIT 12
        `.then((result: any[]) => result.map(row => ({
            ...row,
            count: Number(row.count)
        })));

        // Get revenue statistics
        const revenueStats = await this.prismaService.transaction.aggregate({
            where: {
                status: 'succeeded',
                deleted: false
            },
            _sum: {
                amount_total: true,
                platform_fee: true,
                creator_payout_amount: true
            }
        });

        return {
            totals: {
                users: Number(totalUsers),
                playlists: Number(totalPlaylists),
                songs: Number(totalSongs),
                submissions: Number(totalSubmissions),
                transactions: Number(totalTransactions),
                pendingWithdrawals: Number(pendingWithdrawals)
            },
            charts: {
                usersPerMonth,
                playlistsByGenre: playlistsByGenre.map(item => ({
                    genre: item.genre,
                    count: Number(item._count.playlist_id)
                })),
                usersByRole: usersByRole.map(item => ({
                    role: item.role,
                    count: Number(item._count.user_id)
                })),
                submissionsPerMonth,
                playlistsPerMonth
            },
            revenue: {
                totalRevenue: Number(revenueStats._sum?.amount_total || 0),
                totalFees: Number(revenueStats._sum?.platform_fee || 0),
                totalPayouts: Number(revenueStats._sum?.creator_payout_amount || 0)
            }
        };
    }

    async getDashboardData() {
        // Get recent activity statistics
        const [
            recentUsers,
            recentSubmissions,
            recentTransactions,
            pendingWithdrawalsData
        ] = await Promise.all([
            this.prismaService.user.findMany({
                where: { 
                    is_active: true,
                    deleted: false 
                },
                orderBy: { created_at: 'desc' },
                take: 5,
                select: {
                    user_id: true,
                    username: true,
                    email: true,
                    role: true,
                    created_at: true
                }
            }),
            this.prismaService.submission.findMany({
                where: { deleted: false },
                orderBy: { submitted_at: 'desc' },
                take: 5,
                include: {
                    artist: {
                        select: { username: true }
                    },
                    playlist: {
                        select: { name: true }
                    },
                    song: {
                        select: { title: true }
                    }
                }
            }),
            this.prismaService.transaction.findMany({
                where: { deleted: false },
                orderBy: { created_at: 'desc' },
                take: 5,
                include: {
                    submission: {
                        include: {
                            artist: {
                                select: { username: true }
                            },
                            song: {
                                select: { title: true }
                            }
                        }
                    }
                }
            }),
            this.prismaService.withdrawal.findMany({
                where: { 
                    status: 'pending',
                    deleted: false 
                },
                orderBy: { created_at: 'desc' },
                take: 10,
                include: {
                    user: {
                        select: { username: true, email: true }
                    }
                }
            })
        ]);

        return {
            recentActivity: {
                users: recentUsers,
                submissions: recentSubmissions,
                transactions: recentTransactions
            },
            pendingWithdrawals: pendingWithdrawalsData
        };
    }

    async getWithdrawals(skip = 0, take = 10, status?: 'pending' | 'processing' | 'completed' | 'failed') {
        const where = status ? { status, deleted: false } : { deleted: false };

        const [withdrawals, total] = await Promise.all([
            this.prismaService.withdrawal.findMany({
                where,
                skip,
                take,
                orderBy: { created_at: 'desc' },
                include: {
                    user: {
                        select: {
                            user_id: true,
                            username: true,
                            email: true
                        }
                    }
                }
            }),
            this.prismaService.withdrawal.count({ where })
        ]);

        return {
            data: withdrawals,
            total: Number(total),
            skip,
            take
        };
    }

    async processWithdrawal(withdrawalId: string, status: 'completed' | 'failed') {
        const withdrawal = await this.prismaService.withdrawal.findUnique({
            where: { withdrawal_id: withdrawalId },
            include: {
                user: {
                    select: { username: true, email: true }
                }
            }
        });

        if (!withdrawal) {
            throw new Error('Withdrawal not found');
        }

        if (withdrawal.status !== 'pending') {
            throw new Error('Withdrawal has already been processed');
        }

        const updatedWithdrawal = await this.prismaService.withdrawal.update({
            where: { withdrawal_id: withdrawalId },
            data: {
                status,
                processed_at: new Date()
            },
            include: {
                user: {
                    select: { username: true, email: true }
                }
            }
        });

        return updatedWithdrawal;
    }

    // Admin User Management
    async getUsers(skip = 0, take = 10) {
        const [users, total] = await Promise.all([
            this.prismaService.user.findMany({
                where: { 
                    role: { not: 'admin' },
                    deleted: false 
                },
                skip,
                take,
                orderBy: { created_at: 'desc' },
                select: {
                    user_id: true,
                    username: true,
                    email: true,
                    role: true,
                    is_active: true,
                    email_confirmed: true,
                    created_at: true,
                    updated_at: true,
                    _count: {
                        select: {
                            playlists: true,
                            submissions: true
                        }
                    }
                }
            }),
            this.prismaService.user.count({ 
                where: { 
                    role: { not: 'admin' },
                    deleted: false 
                } 
            })
        ]);

        return {
            data: users,
            total: Number(total),
            skip,
            take
        };
    }

    async getUser(userId: string) {
        const user = await this.prismaService.user.findUnique({
            where: { user_id: userId },
            include: {
                _count: {
                    select: {
                        playlists: true,
                        songs: true,
                        submissions: true
                    }
                }
            }
        });

        if (!user) {
            throw new Error('User not found');
        }

        return user;
    }

    async updateUser(userId: string, userData: any) {
        const user = await this.prismaService.user.update({
            where: { user_id: userId },
            data: userData,
            select: {
                user_id: true,
                username: true,
                email: true,
                role: true,
                is_active: true,
                email_confirmed: true,
                updated_at: true
            }
        });

        return user;
    }

    async deleteUser(userId: string) {
        // Soft delete by setting deleted flag to true
        const user = await this.prismaService.user.update({
            where: { user_id: userId },
            data: { deleted: true },
        });

        return user;
    }

    async suspendUser(userId: string, reason: string) {
        const user = await this.prismaService.user.update({
            where: { user_id: userId },
            data: { is_active: false },
        });

        return user;
    }

    async reactivateUser(userId: string) {
        const user = await this.prismaService.user.update({
            where: { user_id: userId },
            data: { is_active: true },
        });

        return user;
    }

    // Admin Playlist Management
    async getPlaylists(skip = 0, take = 10) {
        const [playlists, total] = await Promise.all([
            this.prismaService.playlist.findMany({
                where: { deleted: false },
                skip,
                take,
                orderBy: { created_at: 'desc' },
                include: {
                    creator: {
                        select: { username: true, email: true }
                    },
                    _count: {
                        select: {
                            submissions: true
                        }
                    }
                }
            }),
            this.prismaService.playlist.count({ where: { deleted: false } })
        ]);

        return {
            data: playlists,
            total: Number(total),
            skip,
            take
        };
    }

    async getPlaylist(playlistId: string) {
        const playlist = await this.prismaService.playlist.findUnique({
            where: { playlist_id: playlistId },
            include: {
                creator: {
                    select: { username: true, email: true }
                },
                _count: {
                    select: {
                        submissions: true
                    }
                }
            }
        });

        if (!playlist) {
            throw new Error('Playlist not found');
        }

        return playlist;
    }

    async updatePlaylist(playlistId: string, playlistData: any) {
        const playlist = await this.prismaService.playlist.update({
            where: { playlist_id: playlistId },
            data: playlistData,
        });

        return playlist;
    }

    async deletePlaylist(playlistId: string) {
        const playlist = await this.prismaService.playlist.update({
            where: { playlist_id: playlistId },
            data: { deleted: true },
        });

        return playlist;
    }

    async flagPlaylist(playlistId: string, reason: string) {
        return { message: 'Playlist flagged successfully' };
    }

    async unflagPlaylist(playlistId: string) {
        return { message: 'Playlist unflagged successfully' };
    }

    // Admin Song Management
    async getSongs(skip = 0, take = 10) {
        const [songs, total] = await Promise.all([
            this.prismaService.song.findMany({
                where: { deleted: false },
                skip,
                take,
                orderBy: { created_at: 'desc' },
                include: {
                    artist: {
                        select: { username: true, email: true }
                    },
                    _count: {
                        select: {
                            submissions: true
                        }
                    }
                }
            }),
            this.prismaService.song.count({ where: { deleted: false } })
        ]);

        return {
            data: songs,
            total: Number(total),
            skip,
            take
        };
    }

    async getSong(songId: string) {
        const song = await this.prismaService.song.findUnique({
            where: { song_id: songId },
            include: {
                artist: {
                    select: { username: true, email: true }
                },
                submissions: {
                    include: {
                        playlist: {
                            select: { name: true }
                        }
                    }
                },
                _count: {
                    select: {
                        submissions: true
                    }
                }
            }
        });

        if (!song) {
            throw new Error('Song not found');
        }

        return song;
    }

    async updateSong(songId: string, songData: any) {
        const song = await this.prismaService.song.update({
            where: { song_id: songId },
            data: songData,
        });

        return song;
    }

    async deleteSong(songId: string) {
        const song = await this.prismaService.song.update({
            where: { song_id: songId },
            data: { deleted: true },
        });

        return song;
    }

    async flagSong(songId: string, reason: string) {
        return { message: 'Song flagged successfully' };
    }

    async unflagSong(songId: string) {
        return { message: 'Song unflagged successfully' };
    }

    // Admin Submission Management
    async getSubmissions(skip = 0, take = 10, status?: string) {
        const where = status ? { status: status as submission_status, deleted: false } : { deleted: false };

        const [submissions, total] = await Promise.all([
            this.prismaService.submission.findMany({
                where,
                skip,
                take,
                orderBy: { submitted_at: 'desc' },
                include: {
                    artist: {
                        select: { username: true, email: true, }
                    },
                    playlist: {
                        select: { name: true }
                    },
                    song: {
                        select: { title: true }
                    }
                }
            }),
            this.prismaService.submission.count({ where })
        ]);

        return {
            data: submissions,
            total: Number(total),
            skip,
            take
        };
    }

    async getSubmission(submissionId: string) {
        const submission = await this.prismaService.submission.findUnique({
            where: { submission_id: submissionId },
            include: {
                artist: {
                    select: { username: true, email: true }
                },
                playlist: {
                    select: { name: true }
                },
                song: {
                    select: { title: true }
                },
                transaction: true
            }
        });

        if (!submission) {
            throw new Error('Submission not found');
        }

        return submission;
    }

    async updateSubmission(submissionId: string, submissionData: any) {
        const submission = await this.prismaService.submission.update({
            where: { submission_id: submissionId },
            data: submissionData,
        });

        return submission;
    }

    async deleteSubmission(submissionId: string) {
        const submission = await this.prismaService.submission.update({
            where: { submission_id: submissionId },
            data: { deleted: true },
        });

        return submission;
    }

    // Admin Transaction Management
    async getTransactions(skip = 0, take = 10, status?: string) {
        const where = status ? { status: status as transaction_status, deleted: false } : { deleted: false };

        const [transactions, total] = await Promise.all([
            this.prismaService.transaction.findMany({
                where,
                skip,
                take,
                orderBy: { created_at: 'desc' },
                include: {
                    submission: {
                        include: {
                            artist: {
                                select: { username: true }
                            },
                            playlist: {
                                select: { name: true }
                            },
                            song: {
                                select: { title: true }
                            }
                        }
                    }
                }
            }),
            this.prismaService.transaction.count({ where })
        ]);

        return {
            data: transactions,
            total: Number(total),
            skip,
            take
        };
    }

    async getTransaction(transactionId: string) {
        const transaction = await this.prismaService.transaction.findUnique({
            where: { transaction_id: transactionId },
            include: {
                submission: {
                    include: {
                        artist: {
                            select: { username: true, email: true }
                        },
                        playlist: {
                            select: { name: true }
                        },
                        song: {
                            select: { title: true }
                        }
                    }
                }
            }
        });

        if (!transaction) {
            throw new Error('Transaction not found');
        }

        return transaction;
    }

    // Admin Platform Management
    async getPlatforms() {
        const platforms = await this.prismaService.platform.findMany({
            where: { deleted: false },
            orderBy: { name: 'asc' }
        });

        return platforms;
    }

    async createPlatform(platformData: any) {
        const platform = await this.prismaService.platform.create({
            data: platformData
        });

        return platform;
    }

    async getPlatform(platformId: number) {
        const platform = await this.prismaService.platform.findUnique({
            where: { platform_id: platformId }
        });

        if (!platform) {
            throw new Error('Platform not found');
        }

        return platform;
    }

    async updatePlatform(platformId: number, platformData: any) {
        const platform = await this.prismaService.platform.update({
            where: { platform_id: platformId },
            data: platformData
        });

        return platform;
    }

    async deletePlatform(platformId: number) {
        const platform = await this.prismaService.platform.update({
            where: { platform_id: platformId },
            data: { deleted: true }
        });

        return platform;
    }
}
