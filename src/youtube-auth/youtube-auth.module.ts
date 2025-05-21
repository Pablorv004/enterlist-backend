import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { YoutubeAuthController } from './youtube-auth.controller';
import { YoutubeAuthService } from './youtube-auth.service';
import { LinkedAccountsModule } from '../linked-accounts/linked-accounts.module';
import { PlatformsModule } from '../platforms/platforms.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        HttpModule,
        ConfigModule,
        LinkedAccountsModule,
        PlatformsModule,
        AuthModule
    ],
    controllers: [YoutubeAuthController],
    providers: [YoutubeAuthService],
    exports: [YoutubeAuthService],
})
export class YoutubeAuthModule { }
