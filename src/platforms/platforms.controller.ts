import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Delete,
    Put,
    UseGuards,
    ParseIntPipe,
} from '@nestjs/common';
import { PlatformsService } from './platforms.service';
import { CreatePlatformDto, UpdatePlatformDto } from './dto/platform.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { user_role } from '@prisma/client';

@Controller('api/platforms')
export class PlatformsController {
    constructor(private readonly platformsService: PlatformsService) { }

    @Get()
    findAll() {
        return this.platformsService.findAll();
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.platformsService.findOne(id);
    }
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(user_role.admin)
    @Post()
    create(@Body() createPlatformDto: CreatePlatformDto) {
        return this.platformsService.create(createPlatformDto);
    }
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(user_role.admin)
    @Put(':id')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() updatePlatformDto: UpdatePlatformDto,
    ) {
        return this.platformsService.update(id, updatePlatformDto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(user_role.admin)
    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.platformsService.remove(id);
    }
}

