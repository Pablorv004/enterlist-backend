import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaypalService } from './paypal.service';
import { PaypalController } from './paypal.controller';

@Module({
    imports: [ConfigModule],
    controllers: [PaypalController],
    providers: [PaypalService],
    exports: [PaypalService],
})
export class PaypalModule { }
