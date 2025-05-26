import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Delete,
    Put,
    UseGuards,
    Query,
    ParseIntPipe,
    DefaultValuePipe
} from '@nestjs/common';
import { SongsService } from './songs.service';
import { CreateSongDto, UpdateSongDto } from './dto/song.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RoleRequiredGuard } from '../auth/guards/role-required.guard';
import { OwnershipGuard } from '../auth/guards/ownership.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Ownership } from '../auth/decorators/ownership.decorator';
import { user_role } from '@prisma/client';

@Controller('api/songs')
export class SongsController {
    constructor(private readonly songsService: SongsService) { }

    @Get()
    findAll(
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    ) {
        return this.songsService.findAll(skip, take);
    }    @UseGuards(JwtAuthGuard, RoleRequiredGuard, OwnershipGuard)
    @Ownership({ model: 'user', userField: 'user_id', paramName: 'artistId' })
    @Get('artist/:artistId')
    findByArtist(
        @Param('artistId') artistId: string,
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    ) {
        return this.songsService.findByArtist(artistId, skip, take);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.songsService.findOne(id);
    }

    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    @Post()
    create(@Body() createSongDto: CreateSongDto) {
        return this.songsService.create(createSongDto);
    }    @UseGuards(JwtAuthGuard, RoleRequiredGuard, OwnershipGuard)
    @Ownership({ model: 'song', userField: 'artist_id' })
    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() updateSongDto: UpdateSongDto,
    ) {
        return this.songsService.update(id, updateSongDto);
    }

    @UseGuards(JwtAuthGuard, RoleRequiredGuard, OwnershipGuard)
    @Ownership({ model: 'song', userField: 'artist_id' })
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.songsService.remove(id);
    }
}

