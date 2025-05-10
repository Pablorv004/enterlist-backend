import { Module } from '@nestjs/common';
import { PlatformsService } from './platforms.service';
import { PlatformsController } from './platforms.controller';

@Module({
    controllers: [PlatformsController],
    providers: [PlatformsService],
    exports: [PlatformsService],
})
export class PlatformsModule { }
