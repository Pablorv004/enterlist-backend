import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PlatformsModule } from './platforms/platforms.module';
import { LinkedAccountsModule } from './linked-accounts/linked-accounts.module';
import { PlaylistsModule } from './playlists/playlists.module';
import { SongsModule } from './songs/songs.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { AdminActionsModule } from './admin-actions/admin-actions.module';
import { HealthModule } from './health/health.module';
import { SpotifyAuthModule } from './spotify-auth/spotify-auth.module';
import { YoutubeAuthModule } from './youtube-auth/youtube-auth.module';
import { PaypalAuthModule } from './paypal-auth/paypal-auth.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { TransactionsModule } from './transactions/transactions.module';
import { EmailModule } from './email/email.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    PlatformsModule,
    LinkedAccountsModule,
    PlaylistsModule,
    SongsModule,
    SubmissionsModule,
    TransactionsModule,
    AdminActionsModule,
    AdminModule,
    HealthModule,
    SpotifyAuthModule,
    YoutubeAuthModule,
    PaypalAuthModule,
    PaymentMethodsModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
