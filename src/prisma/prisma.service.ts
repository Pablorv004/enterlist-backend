import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor() {
        super({
            log: ['error', 'warn'],
        });
    }

    async onModuleInit() {
        await this.$connect();
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }

    async cleanDatabase() {
        if (process.env.NODE_ENV === 'production') {
            return;
        }

        const models = Reflect.ownKeys(this).filter(
            (key) => typeof key === 'string' && !key.startsWith('_') && !['$connect', '$disconnect', '$on', '$transaction', '$use', '$extends'].includes(key as string),
        );

        return await Promise.all(
            models.map((modelKey) => {
                const model = this[modelKey as keyof PrismaService];
                if (model && typeof model === 'object' && 'deleteMany' in model) {
                    return (model as any).deleteMany();
                }
                return Promise.resolve();
            })
        );
    }
}
