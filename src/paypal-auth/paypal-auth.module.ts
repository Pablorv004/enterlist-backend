import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PaypalAuthController } from './paypal-auth.controller';
import { PaypalAuthService } from './paypal-auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    HttpModule,
    PrismaModule,
    AuthModule,
  ],
  controllers: [PaypalAuthController],
  providers: [PaypalAuthService],
  exports: [PaypalAuthService],
})
export class PaypalAuthModule {}
