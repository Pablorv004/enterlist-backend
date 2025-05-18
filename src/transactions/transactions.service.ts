import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto, UpdateTransactionDto } from './dto/transaction.dto';
import { v4 as uuidv4 } from 'uuid';
import { transaction_status, submission_status } from '@prisma/client';

@Injectable()
export class TransactionsService {
    constructor(private readonly prismaService: PrismaService) { }

    async findAll(skip = 0, take = 10, status?: transaction_status) {
        const where = status ? { status } : {};

        const [data, total] = await Promise.all([
            this.prismaService.transaction.findMany({
                where,
                skip,
                take,
                include: {
                    submission: {
                        include: {
                            artist: {
                                select: {
                                    username: true,
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
                                },
                            },
                        },
                    },
                    payment_method: {
                        select: {
                            type: true,
                        },
                    },
                },
                orderBy: { created_at: 'desc' },
            }),
            this.prismaService.transaction.count({ where }),
        ]);

        return { data, total, skip, take };
    }

    async findByArtist(artistId: string, skip = 0, take = 10) {
        const [data, total] = await Promise.all([
            this.prismaService.transaction.findMany({
                where: {
                    submission: {
                        artist_id: artistId,
                    },
                },
                skip,
                take,
                include: {
                    submission: {
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
                                },
                            },
                        },
                    },
                    payment_method: {
                        select: {
                            type: true,
                        },
                    },
                },
                orderBy: { created_at: 'desc' },
            }),
            this.prismaService.transaction.count({
                where: {
                    submission: {
                        artist_id: artistId,
                    },
                },
            }),
        ]);

        return { data, total, skip, take };
    }

    async findOne(id: string) {
        const transaction = await this.prismaService.transaction.findUnique({
            where: { transaction_id: id },
            include: {
                submission: {
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
                            },
                        },
                    },
                },
                payment_method: {
                    select: {
                        type: true,
                        details: true,
                    },
                },
            },
        });

        if (!transaction) {
            throw new NotFoundException(`Transaction with ID ${id} not found`);
        }

        return transaction;
    }

    async create(createTransactionDto: CreateTransactionDto) {
        const { submission_id, payment_method_id } = createTransactionDto;

        const submission = await this.prismaService.submission.findUnique({
            where: { submission_id },
            include: {
                artist: true,
            },
        });

        if (!submission) {
            throw new NotFoundException(`Submission with ID ${submission_id} not found`);
        }

        const paymentMethod = await this.prismaService.paymentMethod.findUnique({
            where: { payment_method_id },
        });

        if (!paymentMethod) {
            throw new NotFoundException(`Payment Method with ID ${payment_method_id} not found`);
        }

        if (paymentMethod.artist_id !== submission.artist_id) {
            throw new ConflictException(`Payment method does not belong to the submission artist`);
        }

        const existingTransaction = await this.prismaService.transaction.findFirst({
            where: { submission_id },
        });

        if (existingTransaction) {
            throw new ConflictException(`Transaction already exists for this submission`);
        }

        const { amount_total, platform_fee, creator_payout_amount } = createTransactionDto;
        if (Number(amount_total) !== Number(platform_fee) + Number(creator_payout_amount)) {
            throw new ConflictException(`Total amount must equal platform fee plus creator payout`);
        }

        const transaction = await this.prismaService.transaction.create({
            data: {
                transaction_id: uuidv4(),
                ...createTransactionDto,
                created_at: new Date(),
                updated_at: new Date(),
            },
            include: {
                submission: {
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
                },
            },
        });

        if (transaction.status === transaction_status.succeeded) {
            await this.prismaService.submission.update({
                where: { submission_id },
                data: {
                    status: submission_status.under_review,
                },
            });
        }

        return transaction;
    }

    async update(id: string, updateTransactionDto: UpdateTransactionDto) {
        const transaction = await this.findOne(id);

        if (updateTransactionDto.status &&
            updateTransactionDto.status !== transaction.status) {

            if (updateTransactionDto.status === transaction_status.succeeded &&
                transaction.submission.status === submission_status.pending) {

                await this.prismaService.submission.update({
                    where: { submission_id: transaction.submission.submission_id },
                    data: {
                        status: submission_status.under_review,
                    },
                });
            }
        }

        return this.prismaService.transaction.update({
            where: { transaction_id: id },
            data: {
                ...updateTransactionDto,
                updated_at: new Date(),
            },
            include: {
                submission: {
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
                },
            },
        });
    }
}

