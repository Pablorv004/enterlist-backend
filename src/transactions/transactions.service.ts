import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto, UpdateTransactionDto } from './dto/transaction.dto';
import { PaypalAuthService } from '../paypal-auth/paypal-auth.service';
import { v4 as uuidv4 } from 'uuid';
import { transaction_status, submission_status } from '@prisma/client';

@Injectable()
export class TransactionsService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly paypalAuthService: PaypalAuthService,
    ) { }

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

    async findByPlaylistOwner(ownerId: string, skip = 0, take = 10) {
        const [data, total] = await Promise.all([
            this.prismaService.transaction.findMany({
                where: {
                    submission: {
                        playlist: {
                            creator_id: ownerId,
                        },
                    },
                },
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
                        playlist: {
                            creator_id: ownerId,
                        },
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

        if (paymentMethod.user_id !== submission.artist_id) {
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

        return transaction;
    }

    async update(id: string, updateTransactionDto: UpdateTransactionDto) {

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

    async getPlaylistMakerBalance(userId: string) {
        const result = await this.prismaService.transaction.aggregate({
            where: {
                submission: {
                    playlist: {
                        creator_id: userId,
                    },
                },
                status: transaction_status.succeeded,
            },
            _sum: {
                creator_payout_amount: true,
            },
            _count: {
                transaction_id: true,
            },
        });

        const totalEarnings = result._sum.creator_payout_amount || 0;
        const totalTransactions = result._count.transaction_id || 0;

        // Get pending earnings (transactions that haven't been paid out yet)
        const pendingResult = await this.prismaService.transaction.aggregate({
            where: {
                submission: {
                    playlist: {
                        creator_id: userId,
                    },
                },
                status: transaction_status.processing,
            },
            _sum: {
                creator_payout_amount: true,
            },
        });

        const pendingEarnings = pendingResult._sum.creator_payout_amount || 0;

        return {
            total: Number(totalEarnings),
            available: Number(totalEarnings) - Number(pendingEarnings),
            pending: Number(pendingEarnings),
            totalEarnings: Number(totalEarnings),
            pendingEarnings: Number(pendingEarnings),
            availableBalance: Number(totalEarnings) - Number(pendingEarnings),
            totalTransactions,
            currency: 'USD', // Default currency
        };
    }

    async getEarningsStats(userId: string, period: 'day' | 'week' | 'month' | 'year') {
        const now = new Date();
        let startDate: Date;

        switch (period) {
            case 'day':
                startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case 'year':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                break;
        }

        const result = await this.prismaService.transaction.aggregate({
            where: {
                submission: {
                    playlist: {
                        creator_id: userId,
                    },
                },
                status: transaction_status.succeeded,
                created_at: {
                    gte: startDate,
                },
            },
            _sum: {
                creator_payout_amount: true,
            },
            _count: {
                transaction_id: true,
            },
        });

        const earnings = result._sum.creator_payout_amount || 0;
        const transactionCount = result._count.transaction_id || 0;

        return {
            period,
            earnings: Number(earnings),
            transactionCount,
            currency: 'USD',
        };
    }

    async processPayPalPayment(
        submissionId: string,
        paymentMethodId: string,
        returnUrl: string,
        cancelUrl: string
    ) {
        // Get submission details
        const submission = await this.prismaService.submission.findUnique({
            where: { submission_id: submissionId },
            include: {
                playlist: {
                    include: {
                        creator: true,
                    },
                },
                song: true,
                artist: true,
            },
        });

        if (!submission) {
            throw new NotFoundException('Submission not found');
        }

        // Get payment method
        const paymentMethod = await this.prismaService.paymentMethod.findUnique({
            where: { payment_method_id: paymentMethodId },
        });

        if (!paymentMethod) {
            throw new NotFoundException('Payment method not found');
        }

        // Get playlist maker's PayPal email from their linked account
        const playlistMakerPayPal = await this.prismaService.linkedAccount.findFirst({
            where: {
                user_id: submission.playlist.creator_id,
                platform: {
                    name: 'PayPal',
                },
            },
        });

        if (!playlistMakerPayPal) {
            throw new BadRequestException('Playlist maker has not linked their PayPal account');
        }

        // Calculate fees
        const submissionFeeAmount = Math.round(Number(submission.playlist.submission_fee) * 100); // Convert to cents
        const platformFee = Math.round(submissionFeeAmount * 0.05); // 5% platform fee
        const creatorPayout = submissionFeeAmount - platformFee;

        // Get playlist maker's PayPal email from their linked account details
        let playlistMakerEmail: string;
        try {
            const details = typeof playlistMakerPayPal.external_user_id === 'string' 
                ? JSON.parse(playlistMakerPayPal.external_user_id) 
                : playlistMakerPayPal.external_user_id;
            playlistMakerEmail = details.email || details.user_id;
        } catch {
            playlistMakerEmail = playlistMakerPayPal.external_user_id;
        }

        // Create PayPal payment
        const paymentDescription = `Song submission: "${submission.song.title}" to playlist "${submission.playlist.name}"`;
          const paypalPayment = await this.paypalAuthService.createPayment(
            submissionFeeAmount,
            'USD',
            paymentDescription,
            returnUrl,
            cancelUrl
        );

        // Create transaction record
        const transaction = await this.prismaService.transaction.create({
            data: {
                transaction_id: uuidv4(),
                submission_id: submissionId,
                payment_method_id: paymentMethodId,
                amount_total: submissionFeeAmount / 100, // Store as decimal
                currency: 'USD',
                platform_fee: platformFee / 100,
                creator_payout_amount: creatorPayout / 100,
                status: transaction_status.pending,
                payment_provider_transaction_id: paypalPayment.id,
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

        // Find the approval URL from PayPal response
        const approvalUrl = paypalPayment.links.find(link => link.rel === 'approval_url')?.href;

        return {
            transaction,
            paypalPayment,
            approvalUrl,
        };
    }

    async executePayPalPayment(paymentId: string, payerId: string) {
        // Execute the PayPal payment
        const executedPayment = await this.paypalAuthService.executePayment(paymentId, payerId);

        // Update transaction status
        const transaction = await this.prismaService.transaction.findFirst({
            where: {
                payment_provider_transaction_id: paymentId,
            },
        });

        if (!transaction) {
            throw new NotFoundException('Transaction not found');
        }

        const updatedTransaction = await this.prismaService.transaction.update({
            where: {
                transaction_id: transaction.transaction_id,
            },
            data: {
                status: transaction_status.succeeded,
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

        // Update submission status if payment is successful
        if (executedPayment.state === 'approved') {
            await this.prismaService.submission.update({
                where: {
                    submission_id: transaction.submission_id,
                },
                data: {
                    status: submission_status.pending, // Set to pending for review
                },
            });
        }

        return updatedTransaction;
    }

    async withdrawFunds(userId: string, amount: number) {
        // Get playlist maker's current balance
        const balance = await this.getPlaylistMakerBalance(userId);
        
        if (balance.available < amount) {
            throw new BadRequestException('Insufficient available balance for withdrawal');
        }

        // Get user's PayPal email from linked account
        const userPayPalEmail = await this.paypalAuthService.getUserPayPalEmail(userId);
        
        // Create PayPal payout
        const payout = await this.paypalAuthService.createPayout(
            userPayPalEmail,
            Math.round(amount * 100), // Convert to cents
            'USD',
            `Enterlist balance withdrawal for ${amount} USD`
        );

        // Note: In a real application, you might want to create a withdrawal transaction record
        // to track the payout status and link it to the user's balance
        
        return {
            success: true,
            payout,
            message: `Withdrawal of $${amount} initiated successfully`,
            payoutBatchId: payout.batch_header.payout_batch_id
        };
    }
}

