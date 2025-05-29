import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
                where: { is_active: true }
            }),
            this.prismaService.playlist.count({
                where: { deleted: false }
            }),
            this.prismaService.song.count({
                where: { deleted: false }
            }),
            this.prismaService.submission.count(),
            this.prismaService.transaction.count(),
            this.prismaService.withdrawal.count({
                where: { status: 'pending' }
            })
        ]);

        // Get users registered per month (last 12 months)
        const usersPerMonth = await this.prismaService.$queryRaw`
            SELECT 
                DATE_TRUNC('month', created_at) as month,
                COUNT(*) as count
            FROM users
            WHERE created_at >= NOW() - INTERVAL '12 months'
                AND is_active = true
            GROUP BY DATE_TRUNC('month', created_at)
            ORDER BY month DESC
            LIMIT 12
        `;

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

        // Get users by role
        const usersByRole = await this.prismaService.user.groupBy({
            by: ['role'],
            where: { is_active: true },
            _count: {
                user_id: true
            }
        });

        // Get submissions per month (last 12 months)
        const submissionsPerMonth = await this.prismaService.$queryRaw`
            SELECT 
                DATE_TRUNC('month', created_at) as month,
                COUNT(*) as count
            FROM submissions
            WHERE created_at >= NOW() - INTERVAL '12 months'
            GROUP BY DATE_TRUNC('month', created_at)
            ORDER BY month DESC
            LIMIT 12
        `;

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
        `;

        // Get revenue statistics
        const revenueStats = await this.prismaService.transaction.aggregate({
            where: {
                status: 'succeeded'
            },
            _sum: {
                amount_total: true,
                platform_fee: true,
                creator_payout_amount: true
            }
        });

        return {
            totals: {
                users: totalUsers,
                playlists: totalPlaylists,
                songs: totalSongs,
                submissions: totalSubmissions,
                transactions: totalTransactions,
                pendingWithdrawals
            },
            charts: {
                usersPerMonth,
                playlistsByGenre: playlistsByGenre.map(item => ({
                    genre: item.genre,
                    count: item._count.playlist_id
                })),
                usersByRole: usersByRole.map(item => ({
                    role: item.role,
                    count: item._count.user_id
                })),
                submissionsPerMonth,
                playlistsPerMonth
            },
            revenue: {
                totalRevenue: revenueStats._sum?.amount_total || 0,
                totalFees: (revenueStats._sum?.platform_fee || 0),
                totalPayouts: revenueStats._sum?.creator_payout_amount || 0
            }
        };
    }    async getDashboardData() {
        // Get recent activity statistics
        const [
            recentUsers,
            recentSubmissions,
            recentTransactions,
            pendingWithdrawalsData
        ] = await Promise.all([
            this.prismaService.user.findMany({
                where: { is_active: true },
                orderBy: { created_at: 'desc' },
                take: 5,
                select: {
                    user_id: true,
                    username: true,
                    email: true,
                    role: true,
                    created_at: true
                }
            }),            this.prismaService.submission.findMany({
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
                where: { status: 'pending' },
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
    }    async getWithdrawals(skip = 0, take = 10, status?: 'pending' | 'processing' | 'completed' | 'failed') {
        const where = status ? { status } : {};
        
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
            total,
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
        }        const updatedWithdrawal = await this.prismaService.withdrawal.update({
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
}
