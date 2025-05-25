import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaypalService } from '../paypal/paypal.service';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './dto/payment-method.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentMethodsService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly paypalService: PaypalService
    ) { }

    async findAll() {
        const data = await this.prismaService.paymentMethod.findMany({
            select: {
                payment_method_id: true,
                artist_id: true,
                type: true,
                details: true,
                is_default: true,
                created_at: true,
                updated_at: true,
                artist: {
                    select: {
                        username: true,
                        email: true,
                    },
                },
            },
        });
        
        const total = data.length;
        return { data, total };
    }

    async findByArtist(artistId: string) {
        const data = await this.prismaService.paymentMethod.findMany({
            where: { artist_id: artistId },
            select: {
                payment_method_id: true,
                type: true,
                details: true,
                is_default: true,
                created_at: true,
                updated_at: true,
            },
        });
        
        const total = data.length;
        return { data, total };
    }

    async findOne(id: string) {
        const paymentMethod = await this.prismaService.paymentMethod.findUnique({
            where: { payment_method_id: id },
            select: {
                payment_method_id: true,
                artist_id: true,
                type: true,
                details: true,
                is_default: true,
                created_at: true,
                updated_at: true,
                artist: {
                    select: {
                        username: true,
                        email: true,
                    },
                },
            },
        });

        if (!paymentMethod) {
            throw new NotFoundException(`Payment Method with ID ${id} not found`);
        }

        return paymentMethod;
    }

    async create(createPaymentMethodDto: CreatePaymentMethodDto) {
        const { artist_id, is_default } = createPaymentMethodDto;

        const artist = await this.prismaService.user.findUnique({
            where: { user_id: artist_id },
        });

        if (!artist) {
            throw new NotFoundException(`Artist with ID ${artist_id} not found`);
        }

        if (artist.role !== 'artist' && artist.role !== 'admin') {
            throw new ConflictException(`User must be an artist to add payment methods`);
        }

        if (is_default) {
            await this.prismaService.paymentMethod.updateMany({
                where: { artist_id },
                data: { is_default: false },
            });
        }

        return this.prismaService.paymentMethod.create({
            data: {
                payment_method_id: uuidv4(),
                ...createPaymentMethodDto,
                created_at: new Date(),
                updated_at: new Date(),
            },
            select: {
                payment_method_id: true,
                artist_id: true,
                type: true,
                details: true,
                is_default: true,
                created_at: true,
                updated_at: true,
            },
        });
    }

    async update(id: string, updatePaymentMethodDto: UpdatePaymentMethodDto) {
        const paymentMethod = await this.prismaService.paymentMethod.findUnique({
            where: { payment_method_id: id },
        });

        if (!paymentMethod) {
            throw new NotFoundException(`Payment Method with ID ${id} not found`);
        }

        const { is_default } = updatePaymentMethodDto;

        if (is_default) {
            await this.prismaService.paymentMethod.updateMany({
                where: {
                    artist_id: paymentMethod.artist_id,
                    NOT: { payment_method_id: id },
                },
                data: { is_default: false },
            });
        }

        return this.prismaService.paymentMethod.update({
            where: { payment_method_id: id },
            data: {
                ...updatePaymentMethodDto,
                updated_at: new Date(),
            },
            select: {
                payment_method_id: true,
                artist_id: true,
                type: true,
                details: true,
                is_default: true,
                created_at: true,
                updated_at: true,
            },
        });
    }

    async remove(id: string) {
        const paymentMethod = await this.prismaService.paymentMethod.findUnique({
            where: { payment_method_id: id },
        });

        if (!paymentMethod) {
            throw new NotFoundException(`Payment Method with ID ${id} not found`);
        }

        const transactionsCount = await this.prismaService.transaction.count({
            where: { payment_method_id: id },
        });

        if (transactionsCount > 0) {
            throw new ConflictException(
                `Cannot delete payment method with ID ${id} as it is used in ${transactionsCount} transactions`
            );
        }

        return this.prismaService.paymentMethod.delete({
            where: { payment_method_id: id },
        });
    }
}
