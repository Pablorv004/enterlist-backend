import { Module } from '@nestjs/common';
import { LinkedAccountsService } from './linked-accounts.service';
import { LinkedAccountsController } from './linked-accounts.controller';

@Module({
  controllers: [LinkedAccountsController],
  providers: [LinkedAccountsService],
  exports: [LinkedAccountsService],
})
export class LinkedAccountsModule {}
