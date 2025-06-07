import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { PaypalAuthModule } from '../paypal-auth/paypal-auth.module';

@Module({
  imports: [HttpModule, PaypalAuthModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
