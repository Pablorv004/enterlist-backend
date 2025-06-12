import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { PaypalAuthModule } from '../paypal-auth/paypal-auth.module';
import { SubmissionsModule } from '../submissions/submissions.module';

@Module({
  imports: [HttpModule, PaypalAuthModule, SubmissionsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
