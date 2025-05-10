import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    UseGuards,
    Query,
    ParseIntPipe,
    DefaultValuePipe,
} from '@nestjs/common';
import { AdminActionsService } from './admin-actions.service';
import { CreateAdminActionDto } from './dto/admin-action.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { user_role } from '@prisma/client';

@Controller('admin-actions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(user_role.admin)
export class AdminActionsController {
    constructor(private readonly adminActionsService: AdminActionsService) { }

    @Get()
    findAll(
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    ) {
        return this.adminActionsService.findAll(skip, take);
    }

    @Get('admin/:adminId')
    findByAdmin(
        @Param('adminId') adminId: string,
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    ) {
        return this.adminActionsService.findByAdmin(adminId, skip, take);
    }

    @Get('target/:targetId')
    findByTarget(
        @Param('targetId') targetId: string,
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    ) {
        return this.adminActionsService.findByTarget(targetId, skip, take);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.adminActionsService.findOne(id);
    }

    @Post()
    create(@Body() createAdminActionDto: CreateAdminActionDto) {
        return this.adminActionsService.create(createAdminActionDto);
    }
}

