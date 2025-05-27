import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentMethodsService } from './payment-methods.service';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaypalAuthModule } from '../paypal-auth/paypal-auth.module';

@Module({
    imports: [ConfigModule, PaypalAuthModule],
    controllers: [PaymentMethodsController],
    providers: [PaymentMethodsService],
    exports: [PaymentMethodsService],
})
export class PaymentMethodsModule { }
