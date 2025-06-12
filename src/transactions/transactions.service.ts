import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';
import { PaypalAuthService } from '../paypal-auth/paypal-auth.service';
import { SubmissionsService } from '../submissions/submissions.service';
import { v4 as uuidv4 } from 'uuid';
import {
  transaction_status,
  submission_status,
  withdrawal_status,
} from '@prisma/client';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly paypalAuthService: PaypalAuthService,
    private readonly submissionsService: SubmissionsService,
  ) {}
  async findAll(skip = 0, take = 10, status?: transaction_status) {
    const where = status ? { status, deleted: false } : { deleted: false };

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
            deleted: false,
          },
          deleted: false,
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
            deleted: false,
          },
          deleted: false,
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
            deleted: false,
          },
          deleted: false,
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

    if (!transaction || transaction.deleted) {
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

    if (!submission || submission.deleted) {
      throw new NotFoundException(
        `Submission with ID ${submission_id} not found`,
      );
    }
    const paymentMethod = await this.prismaService.paymentMethod.findUnique({
      where: { payment_method_id },
    });

    if (!paymentMethod || paymentMethod.deleted) {
      throw new NotFoundException(
        `Payment Method with ID ${payment_method_id} not found`,
      );
    }

    if (paymentMethod.user_id !== submission.artist_id) {
      throw new ConflictException(
        `Payment method does not belong to the submission artist`,
      );
    }

    const existingTransaction = await this.prismaService.transaction.findFirst({
      where: { submission_id },
    });

    if (existingTransaction) {
      throw new ConflictException(
        `Transaction already exists for this submission`,
      );
    }

    const { amount_total, platform_fee, creator_payout_amount } =
      createTransactionDto;
    if (
      Number(amount_total) !==
      Number(platform_fee) + Number(creator_payout_amount)
    ) {
      throw new ConflictException(
        `Total amount must equal platform fee plus creator payout`,
      );
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
    // Get user's current balance from the balance column
    const user = await this.prismaService.user.findUnique({
      where: { user_id: userId },
      select: { balance: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get total earnings from successful transactions
    const earningsResult = await this.prismaService.transaction.aggregate({
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

    const totalEarnings = earningsResult._sum.creator_payout_amount || 0;
    const totalTransactions = earningsResult._count.transaction_id || 0;

    // Get pending withdrawals
    const pendingWithdrawals = await this.prismaService.withdrawal.aggregate({
      where: {
        user_id: userId,
        status: {
          in: ['pending', 'processing'],
        },
      },
      _sum: {
        amount: true,
      },
    });

    const pendingWithdrawalAmount = pendingWithdrawals._sum.amount || 0;
    const availableBalance =
      Number(user.balance) - Number(pendingWithdrawalAmount);

    return {
      total: Number(totalEarnings),
      available: Math.max(0, availableBalance), // Ensure non-negative
      totalEarnings: Number(totalEarnings),
      availableBalance: Math.max(0, availableBalance),
      totalTransactions,
      currency: 'USD',
    };
  }

  async getEarningsStats(
    userId: string,
    period: 'day' | 'week' | 'month' | 'year',
  ) {
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
    cancelUrl: string,
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

    // Check for existing transactions for this submission to prevent duplicates
    const existingTransaction = await this.prismaService.transaction.findFirst({
      where: { submission_id: submissionId, status: transaction_status.succeeded},
    });

    if (existingTransaction) {
      throw new ConflictException(
        `Transaction already exists for this submission. Please contact support if you believe this is an error.`,
      );
    } // Calculate fees - all payments go to Enterlist first (enterlist@business.com)
    // Later, playlist makers can withdraw their portion of the earnings
    const submissionFeeAmount = Math.round(
      Number(submission.playlist.submission_fee) * 100,
    ); // Convert to cents
    const platformFee = Math.round(submissionFeeAmount * 0.05); // 5% platform fee
    const creatorPayout = submissionFeeAmount - platformFee;

    // If submission fee is zero, skip PayPal and approve directly
    if (submissionFeeAmount === 0) {
      // Create transaction record for free submission
      const transaction = await this.prismaService.transaction.create({
        data: {
          transaction_id: uuidv4(),
          submission_id: submissionId,
          payment_method_id: paymentMethodId,
          amount_total: 0,
          currency: 'USD',
          platform_fee: 0,
          creator_payout_amount: 0,
          status: transaction_status.succeeded, // Mark as succeeded for free submissions
          payment_provider_transaction_id: `free_${Date.now()}`, // Generate a unique ID for free submissions
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

      // Use the centralized method to confirm submission after payment (even for free submissions)
      await this.submissionsService.confirmSubmissionAfterPayment(submissionId);

      // Return success response without PayPal payment
      return {
        transaction,
        paypalPayment: null,
        approvalUrl: null,
        success: true,
        isFreeSubmission: true,
      };
    }

    try {
      // Create PayPal payment for paid submissions
      const paymentDescription = `Song submission: "${submission.song.title}" to playlist "${submission.playlist.name}"`;
      const paypalPayment = await this.paypalAuthService.createPayment(
        submissionFeeAmount,
        'USD',
        paymentDescription,
        returnUrl,
        cancelUrl,
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
      const approvalUrl = paypalPayment.links.find(
        (link) => link.rel === 'approval_url',
      )?.href;

      return {
        transaction,
        paypalPayment,
        approvalUrl,
      };
    } catch (error) {
      // If PayPal payment creation fails, delete the submission
      await this.prismaService.submission.delete({
        where: { submission_id: submissionId },
      });

      // Re-throw the error with more details for debugging
      throw new BadRequestException({
        message: 'Failed to create PayPal payment',
        details: error.message,
        originalError: error.response?.data || error.toString(),
      });
    }
  }

  async executePayPalPayment(paymentId: string, payerId: string) {
    // Execute the PayPal payment
    const executedPayment = await this.paypalAuthService.executePayment(
      paymentId,
      payerId,
    );

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
                creator_id: true,
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
    }); // Update submission status and add balance if payment is successful
    if (executedPayment.state === 'approved') {
      // Use the centralized method to confirm submission after payment
      await this.submissionsService.confirmSubmissionAfterPayment(
        transaction.submission_id,
      );
    }

    // Always add creator payout amount to playlist maker's balance when payment is successful
    // regardless of whether they later approve or reject the submission
    if (executedPayment.state === 'approved') {
      await this.prismaService.user.update({
        where: {
          user_id: updatedTransaction.submission.playlist.creator_id,
        },
        data: {
          balance: {
            increment: updatedTransaction.creator_payout_amount,
          },
        },
      });
    }

    return updatedTransaction;
  }
  async withdrawFunds(userId: string, amount: number) {
    // Get playlist maker's current balance
    const balance = await this.getPlaylistMakerBalance(userId);

    if (balance.available < amount) {
      throw new BadRequestException(
        'Insufficient available balance for withdrawal',
      );
    }

    // Get user's PayPal email from linked account
    const userPayPalEmail =
      await this.paypalAuthService.getUserPayPalEmail(userId);

    // Create withdrawal record first
    const withdrawal = await this.prismaService.withdrawal.create({
      data: {
        withdrawal_id: uuidv4(),
        user_id: userId,
        amount: amount,
        currency: 'USD',
        status: 'pending' as any, // TypeScript workaround for enum
        requested_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    try {
      // Create PayPal payout
      const payout = await this.paypalAuthService.createPayout(
        userPayPalEmail,
        Math.round(amount * 100), // Convert to cents
        'USD',
        `Enterlist balance withdrawal for ${amount} USD`,
      );

      // Update withdrawal record with PayPal details
      await this.prismaService.withdrawal.update({
        where: { withdrawal_id: withdrawal.withdrawal_id },
        data: {
          status: 'processing' as any,
          paypal_batch_id: payout.batch_header.payout_batch_id,
          payout_response: JSON.stringify(payout),
          updated_at: new Date(),
        },
      });

      // Deduct amount from user's balance
      await this.prismaService.user.update({
        where: { user_id: userId },
        data: {
          balance: {
            decrement: amount,
          },
        },
      });

      return {
        success: true,
        withdrawal,
        payout,
        message: `Withdrawal of $${amount} initiated successfully`,
        payoutBatchId: payout.batch_header.payout_batch_id,
      };
    } catch (error) {
      // If PayPal payout fails, mark withdrawal as failed
      await this.prismaService.withdrawal.update({
        where: { withdrawal_id: withdrawal.withdrawal_id },
        data: {
          status: 'failed' as any,
          error_message: error.message,
          updated_at: new Date(),
        },
      });

      throw new BadRequestException(`Withdrawal failed: ${error.message}`);
    }
  }

  async getWithdrawals(userId: string, skip = 0, take = 10) {
    const [data, total] = await Promise.all([
      this.prismaService.withdrawal.findMany({
        where: { user_id: userId },
        skip,
        take,
        orderBy: { created_at: 'desc' },
      }),
      this.prismaService.withdrawal.count({
        where: { user_id: userId },
      }),
    ]);

    return { data, total, skip, take };
  }

  async getPaymentDetailsBySubmission(
    submissionId: string,
    paymentId?: string,
    payerId?: string,
  ) {
    // Get the transaction associated with this submission
    const transaction = await this.prismaService.transaction.findFirst({
      where: { submission_id: submissionId },
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

    if (!transaction) {
      throw new NotFoundException('Transaction not found for this submission');
    }

    // If PayPal parameters are provided, execute the payment
    if (paymentId && payerId && transaction.status === transaction_status.pending) {
      try {
        const executedPayment = await this.paypalAuthService.executePayment(
          paymentId,
          payerId,
        );

        // Update transaction status
        await this.prismaService.transaction.update({
          where: { transaction_id: transaction.transaction_id },
          data: {
            status: transaction_status.succeeded,
            updated_at: new Date(),
          },
        });

        // Update submission status to pending for review
        await this.prismaService.submission.update({
          where: { submission_id: submissionId },
          data: { status: submission_status.pending },
        });

        return {
          success: true,
          executed: true,
          transaction: {
            ...transaction,
            status: transaction_status.succeeded,
          },
          executedPayment,
        };
      } catch (error) {
        // If execution fails, mark transaction as failed
        await this.prismaService.transaction.update({
          where: { transaction_id: transaction.transaction_id },
          data: {
            status: transaction_status.failed,
            updated_at: new Date(),
          },
        });

        throw new BadRequestException(`Payment execution failed: ${error.message}`);
      }
    }

    // Return transaction details
    return {
      success: true,
      executed: false,
      transaction,
    };
  }

  async completeMobilePayPalPayment(submissionId: string) {
    // Find the transaction associated with this submission
    const transaction = await this.prismaService.transaction.findFirst({
      where: {
        submission_id: submissionId,
        status: transaction_status.pending, // Should be in pending status from mobile payment flow
      },
      include: {
        submission: {
          include: {
            playlist: {
              select: {
                creator_id: true,
              },
            },
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found or already processed');
    }

    // Update transaction status to succeeded
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
                creator_id: true,
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

    // Use the centralized method to confirm submission after payment
    await this.submissionsService.confirmSubmissionAfterPayment(submissionId);

    // Add creator payout amount to playlist maker's balance
    await this.prismaService.user.update({
      where: {
        user_id: updatedTransaction.submission.playlist.creator_id,
      },
      data: {
        balance: {
          increment: updatedTransaction.creator_payout_amount,
        },
      },
    });

    return {
      success: true,
      transaction: updatedTransaction,
      message: 'Mobile PayPal payment completed successfully',
    };
  }
}
