import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SpotifyAuthController } from './spotify-auth.controller';
import { SpotifyAuthService } from './spotify-auth.service';
import { LinkedAccountsModule } from '../linked-accounts/linked-accounts.module';
import { PlatformsModule } from '../platforms/platforms.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    LinkedAccountsModule,
    PlatformsModule,
    AuthModule,
  ],
  controllers: [SpotifyAuthController],
  providers: [SpotifyAuthService],
  exports: [SpotifyAuthService],
})
export class SpotifyAuthModule {}
