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
    Req,
    NotFoundException,
    BadRequestException
} from '@nestjs/common';
import { PlaylistsService } from './playlists.service';
import { CreatePlaylistDto, UpdatePlaylistDto } from './dto/playlist.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailConfirmedGuard } from '../auth/guards/email-confirmed.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RoleRequiredGuard } from '../auth/guards/role-required.guard';
import { OwnershipGuard } from '../auth/guards/ownership.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Ownership } from '../auth/decorators/ownership.decorator';
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
    
    @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard, OwnershipGuard)
    @Ownership({ model: 'user', userField: 'user_id', paramName: 'creatorId' })
    @Get('creator/:creatorId')
    findByCreator(
        @Param('creatorId') creatorId: string,
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    ) {
        return this.playlistsService.findByCreator(creatorId, skip, take);
    }
    
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.playlistsService.findOne(id);
    }

    @Get(':id/tracks')
    getPlaylistTracks(@Param('id') id: string) {
        return this.playlistsService.getPlaylistTracks(id);
    }    
    
    @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard)
    @Roles(user_role.admin)
    @Post()
    create(@Body() createPlaylistDto: CreatePlaylistDto) {
        return this.playlistsService.create(createPlaylistDto);
    }    
    
    @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard, OwnershipGuard)
    @Ownership({ model: 'playlist', userField: 'creator_id' })
    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() updatePlaylistDto: UpdatePlaylistDto,
    ) {
        return this.playlistsService.update(id, updatePlaylistDto);
    }    
    
    @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard, OwnershipGuard)
    @Ownership({ model: 'playlist', userField: 'creator_id' })
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.playlistsService.remove(id);
    }    
    
    @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard, OwnershipGuard)
    @Ownership({ model: 'playlist', userField: 'creator_id' })
    @Put(':id/submission-fee')
    updateSubmissionFee(
        @Param('id') id: string,
        @Body() body: { submission_fee: number }
    ) {
        return this.playlistsService.update(id, { submission_fee: body.submission_fee });
    }    @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard, OwnershipGuard)
    @Ownership({ model: 'playlist', userField: 'creator_id' })
    @Put(':id/genre')
    updateGenre(
        @Param('id') id: string,
        @Body() body: { genre: string }
    ) {
        return this.playlistsService.update(id, { genre: body.genre });
    }
    
    @Get('platform/:platformId')
    findByPlatform(
        @Param('platformId', ParseIntPipe) platformId: number,
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(50), ParseIntPipe) take: number,
    ) {
        return this.playlistsService.findByPlatform(platformId, skip, take);
    }    
    
    @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard, OwnershipGuard)
    @Ownership({ model: 'user', userField: 'user_id', paramName: 'userId' })
    @Post('sync/:userId')
    syncPlaylists(
        @Param('userId') userId: string,
        @Req() req: any
    ) {
        return this.playlistsService.syncPlaylists(userId);
    }
}

