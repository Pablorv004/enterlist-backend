import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { PaypalService } from './paypal.service';

@Module({
    imports: [HttpModule],
    controllers: [TransactionsController],
    providers: [TransactionsService, PaypalService],
    exports: [TransactionsService],
})
export class TransactionsModule { }
