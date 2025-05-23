import { Module } from '@nestjs/common';
import { SongsService } from './songs.service';
import { SongsController } from './songs.controller';

@Module({
    controllers: [SongsController],
    providers: [SongsService],
    exports: [SongsService],
})
export class SongsModule { }
