import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './dto/payment-method.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentMethodsService {
    constructor(
        private readonly prismaService: PrismaService,
    ) { }    async findAll() {
        const data = await this.prismaService.paymentMethod.findMany({
            where: {
                deleted: false
            },
            select: {
                payment_method_id: true,
                user_id: true,
                type: true,
                details: true,
                is_default: true,
                created_at: true,
                updated_at: true,
                users: {
                    select: {
                        username: true,
                        email: true,
                    },
                },
            },
        });
        
        const total = data.length;
        return { data, total };
    }    async findByUser(userId: string) {
        const data = await this.prismaService.paymentMethod.findMany({
            where: { 
                user_id: userId,
                deleted: false
            },
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
                user_id: true,
                type: true,
                details: true,
                is_default: true,
                created_at: true,
                updated_at: true,
                deleted: true,
                users: {
                    select: {
                        username: true,
                        email: true,
                    },
                },
            },
        });

        if (!paymentMethod || paymentMethod.deleted) {
            throw new NotFoundException(`Payment Method with ID ${id} not found`);
        }

        return paymentMethod;
    }

    async create(createPaymentMethodDto: CreatePaymentMethodDto) {
        const { user_id, is_default } = createPaymentMethodDto;

        const user = await this.prismaService.user.findUnique({
            where: { user_id: user_id },
        });

        if (!user) {
            throw new NotFoundException(`User with ID ${user_id} not found`);
        }

        if (is_default) {
            await this.prismaService.paymentMethod.updateMany({
                where: { user_id },
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
                user_id: true,
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
                    user_id: paymentMethod.user_id,
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
                user_id: true,
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

        if (!paymentMethod || paymentMethod.deleted) {
            throw new NotFoundException(`Payment Method with ID ${id} not found`);
        }

        return this.prismaService.paymentMethod.update({
            where: { payment_method_id: id },
            data: { deleted: true },
        });
    }
}
