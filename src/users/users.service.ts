import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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
    }
}
