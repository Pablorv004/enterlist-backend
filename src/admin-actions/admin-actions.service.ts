import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminActionDto } from './dto/admin-action.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AdminActionsService {
    constructor(private readonly prismaService: PrismaService) { }

    async findAll(skip = 0, take = 10) {
        const [actions, count] = await Promise.all([
            this.prismaService.adminAction.findMany({
                skip,
                take,
                include: {
                    admin: {
                        select: {
                            username: true,
                            email: true,
                        },
                    },
                    target_user: {
                        select: {
                            username: true,
                            email: true,
                        },
                    },
                    target_playlist: {
                        select: {
                            name: true,
                        },
                    },
                    target_song: {
                        select: {
                            title: true,
                        },
                    },
                },
                orderBy: { action_timestamp: 'desc' },
            }),
            this.prismaService.adminAction.count(),
        ]);

        return { actions, count, skip, take };
    }

    async findByAdmin(adminId: string, skip = 0, take = 10) {
        const [actions, count] = await Promise.all([
            this.prismaService.adminAction.findMany({
                where: { admin_user_id: adminId },
                skip,
                take,
                include: {
                    target_user: {
                        select: {
                            username: true,
                            email: true,
                        },
                    },
                    target_playlist: {
                        select: {
                            name: true,
                        },
                    },
                    target_song: {
                        select: {
                            title: true,
                        },
                    },
                },
                orderBy: { action_timestamp: 'desc' },
            }),
            this.prismaService.adminAction.count({
                where: { admin_user_id: adminId },
            }),
        ]);

        return { actions, count, skip, take };
    }

    async findByTarget(targetId: string, skip = 0, take = 10) {
        const [actions, count] = await Promise.all([
            this.prismaService.adminAction.findMany({
                where: {
                    OR: [
                        { target_user_id: targetId },
                        { target_playlist_id: targetId },
                        { target_song_id: targetId },
                    ],
                },
                skip,
                take,
                include: {
                    admin: {
                        select: {
                            username: true,
                            email: true,
                        },
                    },
                    target_user: {
                        select: {
                            username: true,
                            email: true,
                        },
                    },
                    target_playlist: {
                        select: {
                            name: true,
                        },
                    },
                    target_song: {
                        select: {
                            title: true,
                        },
                    },
                },
                orderBy: { action_timestamp: 'desc' },
            }),
            this.prismaService.adminAction.count({
                where: {
                    OR: [
                        { target_user_id: targetId },
                        { target_playlist_id: targetId },
                        { target_song_id: targetId },
                    ],
                },
            }),
        ]);

        return { actions, count, skip, take };
    }

    async findOne(id: string) {
        const action = await this.prismaService.adminAction.findUnique({
            where: { action_id: id },
            include: {
                admin: {
                    select: {
                        user_id: true,
                        username: true,
                        email: true,
                    },
                },
                target_user: {
                    select: {
                        user_id: true,
                        username: true,
                        email: true,
                    },
                },
                target_playlist: {
                    select: {
                        playlist_id: true,
                        name: true,
                    },
                },
                target_song: {
                    select: {
                        song_id: true,
                        title: true,
                    },
                },
            },
        });

        if (!action) {
            throw new NotFoundException(`Admin Action with ID ${id} not found`);
        }

        return action;
    }

    async create(createAdminActionDto: CreateAdminActionDto) {
        const { admin_user_id, target_user_id, target_playlist_id, target_song_id } = createAdminActionDto;

        const admin = await this.prismaService.user.findUnique({
            where: { user_id: admin_user_id },
        });

        if (!admin) {
            throw new NotFoundException(`Admin with ID ${admin_user_id} not found`);
        }

        if (admin.role !== 'admin') {
            throw new NotFoundException(`User with ID ${admin_user_id} is not an admin`);
        }

        if (target_user_id) {
            const targetUser = await this.prismaService.user.findUnique({
                where: { user_id: target_user_id },
            });

            if (!targetUser) {
                throw new NotFoundException(`Target User with ID ${target_user_id} not found`);
            }
        }

        if (target_playlist_id) {
            const targetPlaylist = await this.prismaService.playlist.findUnique({
                where: { playlist_id: target_playlist_id },
            });

            if (!targetPlaylist) {
                throw new NotFoundException(`Target Playlist with ID ${target_playlist_id} not found`);
            }
        }

        if (target_song_id) {
            const targetSong = await this.prismaService.song.findUnique({
                where: { song_id: target_song_id },
            });

            if (!targetSong) {
                throw new NotFoundException(`Target Song with ID ${target_song_id} not found`);
            }
        }

        return this.prismaService.adminAction.create({
            data: {
                action_id: uuidv4(),
                ...createAdminActionDto,
                action_timestamp: new Date(),
            },
            include: {
                admin: {
                    select: {
                        username: true,
                    },
                },
                target_user: {
                    select: {
                        username: true,
                    },
                },
                target_playlist: {
                    select: {
                        name: true,
                    },
                },
                target_song: {
                    select: {
                        title: true,
                    },
                },
            },
        });
    }
}
