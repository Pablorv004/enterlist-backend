import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { user_role } from '@prisma/client';

@Injectable()
export class UsersService {
    constructor(private readonly prismaService: PrismaService) { }

    async findAll(skip = 0, take = 10) {
        const [data, total] = await Promise.all([
            this.prismaService.user.findMany({
                skip,
                take,
                select: {
                    user_id: true,
                    username: true,
                    email: true,
                    role: true,
                    is_active: true,
                    created_at: true,
                    updated_at: true,
                    oauth_provider: true,
                },
            }),
            this.prismaService.user.count(),
        ]);

        return { data, total, skip, take };
    }

    async findOne(id: string) {
        const user = await this.prismaService.user.findUnique({
            where: { user_id: id },
            select: {
                user_id: true,
                username: true,
                email: true,
                role: true,
                is_active: true,
                created_at: true,
                updated_at: true,
                oauth_provider: true,
                linked_accounts: {
                    select: {
                        linked_account_id: true,
                        platform: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        if (!user) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        return user;
    }

    async create(createUserDto: CreateUserDto) {
        const { email, username, password } = createUserDto;

        const existingUser = await this.prismaService.user.findFirst({
            where: {
                OR: [{ email }, { username }],
            },
        });

        if (existingUser) {
            throw new ConflictException(
                existingUser.email === email
                    ? 'Email already in use'
                    : 'Username already taken'
            );
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        return this.prismaService.user.create({
            data: {
                user_id: uuidv4(),
                email,
                username,
                password_hash: passwordHash,
                role: createUserDto.role,
                oauth_provider: createUserDto.oauth_provider,
                oauth_id: createUserDto.oauth_id,
                created_at: new Date(),
                updated_at: new Date(),
            },
            select: {
                user_id: true,
                username: true,
                email: true,
                role: true,
                is_active: true,
                created_at: true,
                updated_at: true,
            },
        });
    }

    async update(id: string, updateUserDto: UpdateUserDto) {
        const user = await this.findOne(id);

        if (updateUserDto.email && updateUserDto.email !== user.email) {
            const existingUser = await this.prismaService.user.findFirst({
                where: { email: updateUserDto.email },
            });

            if (existingUser && existingUser.user_id !== id) {
                throw new ConflictException('Email already in use');
            }
        }

        if (updateUserDto.username && updateUserDto.username !== user.username) {
            const existingUser = await this.prismaService.user.findFirst({
                where: { username: updateUserDto.username },
            });

            if (existingUser && existingUser.user_id !== id) {
                throw new ConflictException('Username already taken');
            }
        }

        const data: any = { ...updateUserDto, updated_at: new Date() };

        if (updateUserDto.password) {
            const saltRounds = 10;
            data.password_hash = await bcrypt.hash(updateUserDto.password, saltRounds);
            delete data.password;
        }

        return this.prismaService.user.update({
            where: { user_id: id },
            data,
            select: {
                user_id: true,
                username: true,
                email: true,
                role: true,
                is_active: true,
                created_at: true,
                updated_at: true,
                oauth_provider: true,
            },
        });
    }

    async updateRole(userId: string, role: user_role) {
        const user = await this.findOne(userId);

        return this.prismaService.user.update({
            where: { user_id: userId },
            data: {
                role,
                updated_at: new Date(),
            },
            select: {
                user_id: true,
                username: true,
                email: true,
                role: true,
                is_active: true,
                created_at: true,
                updated_at: true,
                oauth_provider: true,
            },
        });
    }

    async remove(id: string) {
        await this.findOne(id);

        return this.prismaService.user.update({
            where: { user_id: id },
            data: {
                is_active: false,
                updated_at: new Date(),
            },
            select: {
                user_id: true,
                username: true,
                is_active: true,
            },
        });
    }

    async hardDelete(id: string) {
        await this.findOne(id);

        return this.prismaService.user.delete({
            where: { user_id: id },
        });
    }    // Profile statistics methods
    async getProfileStatistics(userId: string): Promise<any> {
        const user = await this.prismaService.user.findUnique({
            where: { user_id: userId },
            select: { role: true }
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (user.role === 'artist') {
            return this.getArtistStatistics(userId);
        } else if (user.role === 'playlist_maker') {
            return this.getPlaylistMakerStatistics(userId);
        }

        throw new BadRequestException('Invalid user role for statistics');
    }

    private async getArtistStatistics(artistId: string): Promise<any> {
        // Get submission statistics
        const submissionStats = await this.prismaService.submission.groupBy({
            by: ['status'],
            where: {
                artist_id: artistId,
                song: {
                    deleted: false
                }
            },
            _count: {
                submission_id: true
            }
        });

        // Get spending over time (monthly) - using proper field names
        const spendingOverTime = await this.prismaService.$queryRaw`
            SELECT 
                DATE_TRUNC('month', t.created_at) as month,
                SUM(t.amount_total) as total_spent
            FROM transactions t
            INNER JOIN submissions s ON t.submission_id = s.submission_id
            WHERE s.artist_id = ${artistId}
                AND t.status = 'succeeded'
            GROUP BY DATE_TRUNC('month', t.created_at)
            ORDER BY month DESC
            LIMIT 12
        `;

        // Get most expensive genres
        const genreSpending = await this.prismaService.$queryRaw`
            SELECT 
                p.genre,
                SUM(t.amount_total) as total_spent,
                COUNT(s.submission_id) as submission_count
            FROM transactions t
            INNER JOIN submissions s ON t.submission_id = s.submission_id
            INNER JOIN playlists p ON s.playlist_id = p.playlist_id
            WHERE s.artist_id = ${artistId}
                AND t.status = 'succeeded'
                AND p.genre IS NOT NULL
            GROUP BY p.genre
            ORDER BY total_spent DESC
            LIMIT 10
        `;

        // Calculate totals
        const totalSubmissions = submissionStats.reduce((sum, stat) => sum + stat._count.submission_id, 0);
        const approvedSubmissions = submissionStats.find(s => s.status === 'approved')?._count.submission_id || 0;
        const approvalRate = totalSubmissions > 0 ? (approvedSubmissions / totalSubmissions) * 100 : 0;

        const totalSpent = await this.prismaService.transaction.aggregate({
            where: {
                submission: {
                    artist_id: artistId
                },
                status: 'succeeded'
            },
            _sum: {
                amount_total: true
            }
        });

        return {
            totalSubmissions,
            approvedSubmissions,
            approvalRate: Math.round(approvalRate * 100) / 100,
            totalSpent: totalSpent._sum.amount_total || 0,
            submissionsByStatus: submissionStats.map(stat => ({
                status: stat.status,
                count: stat._count.submission_id
            })),
            spendingOverTime,
            genreSpending
        };
    }

    private async getPlaylistMakerStatistics(playlistMakerId: string): Promise<any> {
        // Get playlist statistics
        const playlistStats = await this.prismaService.playlist.aggregate({
            where: {
                creator_id: playlistMakerId,
                deleted: false
            },
            _count: {
                playlist_id: true
            },
            _sum: {
                track_count: true
            }
        });

        // Get earnings over time (monthly)
        const earningsOverTime = await this.prismaService.$queryRaw`
            SELECT 
                DATE_TRUNC('month', t.created_at) as month,
                SUM(t.creator_payout_amount) as total_earned
            FROM transactions t
            INNER JOIN submissions s ON t.submission_id = s.submission_id
            INNER JOIN playlists p ON s.playlist_id = p.playlist_id
            WHERE p.creator_id = ${playlistMakerId}
                AND t.status = 'succeeded'
            GROUP BY DATE_TRUNC('month', t.created_at)
            ORDER BY month DESC
            LIMIT 12
        `;

        // Get submissions by playlist
        const submissionsByPlaylist = await this.prismaService.playlist.findMany({
            where: {
                creator_id: playlistMakerId,
                deleted: false
            },
            select: {
                name: true,
                _count: {
                    select: {
                        submissions: true
                    }
                }
            },
            orderBy: {
                submissions: {
                    _count: 'desc'
                }
            },
            take: 10
        });

        // Get submission status distribution
        const submissionStats = await this.prismaService.submission.groupBy({
            by: ['status'],
            where: {
                playlist: {
                    creator_id: playlistMakerId
                }
            },
            _count: {
                submission_id: true
            }
        });

        const totalEarnings = await this.prismaService.transaction.aggregate({
            where: {
                submission: {
                    playlist: {
                        creator_id: playlistMakerId
                    }
                },
                status: 'succeeded'
            },
            _sum: {
                creator_payout_amount: true
            }
        });

        const totalSubmissions = submissionStats.reduce((sum, stat) => sum + stat._count.submission_id, 0);

        return {
            totalPlaylists: playlistStats._count.playlist_id,
            totalTracks: playlistStats._sum.track_count || 0,
            totalSubmissions,
            totalEarnings: totalEarnings._sum.creator_payout_amount || 0,
            submissionsByStatus: submissionStats.map(stat => ({
                status: stat.status,
                count: stat._count.submission_id
            })),
            earningsOverTime,
            submissionsByPlaylist: submissionsByPlaylist.map(playlist => ({
                name: playlist.name,
                submissionCount: playlist._count.submissions
            }))
        };
    }

    // Account deactivation method
    async deactivateAccount(userId: string) {
        const user = await this.findOne(userId);

        return this.prismaService.user.update({
            where: { user_id: userId },
            data: {
                is_active: false,
                updated_at: new Date()
            },
            select: {
                user_id: true,
                username: true,
                email: true,
                is_active: true
            }
        });
    }

    // Update password method
    async updatePassword(userId: string, currentPassword: string, newPassword: string) {        const user = await this.prismaService.user.findUnique({
            where: { user_id: userId },
            select: {
                user_id: true,
                password_hash: true
            }
        });

        if (!user || !user.password_hash) {
            throw new NotFoundException('User not found or no password set');
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isCurrentPasswordValid) {
            throw new ConflictException('Current password is incorrect');
        }

        // Hash new password
        const saltRounds = 10;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

        return this.prismaService.user.update({
            where: { user_id: userId },
            data: {
                password_hash: newPasswordHash,
                updated_at: new Date()
            },
            select: {
                user_id: true,
                username: true,
                email: true
            }
        });
    }
}
