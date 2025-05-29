import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLinkedAccountDto, UpdateLinkedAccountDto } from './dto/linked-account.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LinkedAccountsService {
    constructor(private readonly prismaService: PrismaService) { }    async findAll() {
        const data = await this.prismaService.linkedAccount.findMany({
            where: {
                deleted: false
            },
            include: {
                user: {
                    select: {
                        username: true,
                        email: true,
                    },
                },
                platform: true,
            },
        });

        return { data };
    }    async findByUser(userId: string) {
        const data = await this.prismaService.linkedAccount.findMany({
            where: { 
                user_id: userId,
                deleted: false
            },
            include: {
                platform: true,
            },
        });

        return { data };
    }

    async findOne(id: string) {
        const linkedAccount = await this.prismaService.linkedAccount.findUnique({
            where: { linked_account_id: id },
            include: {
                user: {
                    select: {
                        username: true,
                        email: true,
                    },
                },
                platform: true,
            },
        });        if (!linkedAccount || linkedAccount.deleted) {
            throw new NotFoundException(`Linked Account with ID ${id} not found`);
        }

        return linkedAccount;
    }

    async create(createLinkedAccountDto: CreateLinkedAccountDto) {
        const { user_id, platform_id } = createLinkedAccountDto;

        const user = await this.prismaService.user.findUnique({
            where: { user_id },
        });

        if (!user) {
            throw new NotFoundException(`User with ID ${user_id} not found`);
        }

        const platform = await this.prismaService.platform.findUnique({
            where: { platform_id },
        });

        if (!platform) {
            throw new NotFoundException(`Platform with ID ${platform_id} not found`);
        }        const existingLink = await this.prismaService.linkedAccount.findFirst({
            where: {
                user_id,
                platform_id,
                deleted: false
            },
        });

        if (existingLink) {
            throw new ConflictException(`Account already linked for this user and platform`);
        }

        return this.prismaService.linkedAccount.create({
            data: {
                linked_account_id: uuidv4(),
                ...createLinkedAccountDto,
                created_at: new Date(),
            },
            include: {
                platform: true,
            },
        });
    }

    async update(id: string, updateLinkedAccountDto: UpdateLinkedAccountDto) {
        await this.findOne(id);

        return this.prismaService.linkedAccount.update({
            where: { linked_account_id: id },
            data: updateLinkedAccountDto,
            include: {
                platform: true,
            },
        });
    }    async remove(id: string) {
        await this.findOne(id);

        return this.prismaService.linkedAccount.update({
            where: { linked_account_id: id },
            data: { deleted: true },
        });
    }
}
