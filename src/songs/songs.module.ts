import { Module } from '@nestjs/common';
import { SongsService } from './songs.service';
import { SongsController } from './songs.controller';
import { SpotifyAuthModule } from '../spotify-auth/spotify-auth.module';
import { YoutubeAuthModule } from '../youtube-auth/youtube-auth.module';

@Module({
  imports: [SpotifyAuthModule, YoutubeAuthModule],
  controllers: [SongsController],
  providers: [SongsService],
  exports: [SongsService],
})
export class SongsModule {}
