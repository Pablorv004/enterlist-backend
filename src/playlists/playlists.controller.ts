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
    DefaultValuePipe,
    Req
} from '@nestjs/common';
import { PlaylistsService } from './playlists.service';
import { CreatePlaylistDto, UpdatePlaylistDto, ImportPlaylistsDto } from './dto/playlist.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { user_role } from '@prisma/client';

@Controller('api/playlists')
export class PlaylistsController {
    constructor(private readonly playlistsService: PlaylistsService) { }

    @Get()
    findAll(
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    ) {
        return this.playlistsService.findAll(skip, take);
    }

    @Get('creator/:creatorId')
    findByCreator(
        @Param('creatorId') creatorId: string,
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    ) {
        return this.playlistsService.findByCreator(creatorId, skip, take);
    }    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.playlistsService.findOne(id);
    }

    @Get(':id/tracks')
    getPlaylistTracks(@Param('id') id: string) {
        return this.playlistsService.getPlaylistTracks(id);
    }

    @UseGuards(JwtAuthGuard)
    @Post()
    create(@Body() createPlaylistDto: CreatePlaylistDto) {
        return this.playlistsService.create(createPlaylistDto);
    }

    @UseGuards(JwtAuthGuard)
    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() updatePlaylistDto: UpdatePlaylistDto,
    ) {
        return this.playlistsService.update(id, updatePlaylistDto);
    }

    @UseGuards(JwtAuthGuard)
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.playlistsService.remove(id);
    }

    @UseGuards(JwtAuthGuard)
    @Post('import')
    importPlaylists(@Req() req, @Body() importPlaylistsDto: ImportPlaylistsDto) {
        return this.playlistsService.importPlaylists(req.user.user_id, importPlaylistsDto.platformId);
    }
}

