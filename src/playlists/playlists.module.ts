import { Module } from '@nestjs/common';
import { PlaylistsService } from './playlists.service';
import { PlaylistsController } from './playlists.controller';
import { SpotifyAuthModule } from '../spotify-auth/spotify-auth.module';
import { YoutubeAuthModule } from '../youtube-auth/youtube-auth.module';

@Module({
    imports: [SpotifyAuthModule, YoutubeAuthModule],
    controllers: [PlaylistsController],
    providers: [PlaylistsService],
    exports: [PlaylistsService],
})
export class PlaylistsModule { }
