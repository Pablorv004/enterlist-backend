import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentMethodsService } from './payment-methods.service';
import { PaymentMethodsController } from './payment-methods.controller';

@Module({
    imports: [ConfigModule],
    controllers: [PaymentMethodsController],
    providers: [PaymentMethodsService],
    exports: [PaymentMethodsService],
})
export class PaymentMethodsModule { }
