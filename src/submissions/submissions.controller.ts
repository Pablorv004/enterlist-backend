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
} from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { CreateSubmissionDto, UpdateSubmissionDto } from './dto/submission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RoleRequiredGuard } from '../auth/guards/role-required.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { user_role, submission_status } from '@prisma/client';

@Controller('api/submissions')
export class SubmissionsController {
    constructor(private readonly submissionsService: SubmissionsService) { }

    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    @Get()
    findAll(
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
        @Query('status') status?: submission_status,
    ) {
        return this.submissionsService.findAll(skip, take, status);
    }    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    @Get('artist/:artistId')
    findByArtist(
        @Param('artistId') artistId: string,
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    ) {
        // Validate the artistId before proceeding
        if (!artistId || artistId === 'undefined') {
            return { data: [], total: 0, skip, take };
        }
        return this.submissionsService.findByArtist(artistId, skip, take);
    }

    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    @Get('playlist/:playlistId')
    findByPlaylist(
        @Param('playlistId') playlistId: string,
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
        @Query('status') status?: submission_status,
    ) {
        return this.submissionsService.findByPlaylist(playlistId, skip, take, status);
    }    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    @Get('creator/:creatorId')
    findByCreator(
        @Param('creatorId') creatorId: string,
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
        @Query('status') status?: submission_status,
        @Query('playlistId') playlistId?: string,
    ) {
        // Validate the creatorId before proceeding
        if (!creatorId || creatorId === 'undefined') {
            return { data: [], total: 0, skip, take };
        }
        return this.submissionsService.findByCreator(creatorId, skip, take, status, playlistId);
    }    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    @Get('stats/creator/:creatorId')
    getSubmissionStatsByCreator(@Param('creatorId') creatorId: string) {
        // Validate the creatorId before proceeding
        if (!creatorId || creatorId === 'undefined') {
            return { 
                pending: 0,
                approved: 0,
                rejected: 0,
                total: 0
            };
        }
        return this.submissionsService.getSubmissionStatsByCreator(creatorId);
    }    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    @Get('earnings/creator/:creatorId')
    getEarningsStatsByCreator(@Param('creatorId') creatorId: string) {
        // Validate the creatorId before proceeding
        if (!creatorId || creatorId === 'undefined') {
            return { 
                total: 0,
                lastMonth: 0,
                lastWeek: 0,
                today: 0
            };
        }
        return this.submissionsService.getEarningsStatsByCreator(creatorId);
    }

    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.submissionsService.findOne(id);
    }

    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    @Post()
    create(@Body() createSubmissionDto: CreateSubmissionDto) {
        return this.submissionsService.create(createSubmissionDto);
    }

    @UseGuards(JwtAuthGuard, RoleRequiredGuard, RolesGuard)
    @Roles(user_role.playlist_maker, user_role.admin)
    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() updateSubmissionDto: UpdateSubmissionDto,
    ) {
        return this.submissionsService.update(id, updateSubmissionDto);
    }    @UseGuards(JwtAuthGuard, RoleRequiredGuard, RolesGuard)
    @Roles(user_role.playlist_maker, user_role.admin)
    @Put(':id/status')
    updateStatus(
        @Param('id') id: string,
        @Body() updateSubmissionDto: UpdateSubmissionDto,
    ) {
        return this.submissionsService.update(id, updateSubmissionDto);
    }

    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.submissionsService.remove(id);
    }
}

