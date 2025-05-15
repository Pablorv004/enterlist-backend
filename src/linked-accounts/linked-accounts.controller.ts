import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Delete,
    Put,
    UseGuards,
} from '@nestjs/common';
import { LinkedAccountsService } from './linked-accounts.service';
import { CreateLinkedAccountDto, UpdateLinkedAccountDto } from './dto/linked-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { user_role } from '@prisma/client';

@Controller('api/linked-accounts')
export class LinkedAccountsController {
    constructor(private readonly linkedAccountsService: LinkedAccountsService) { }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(user_role.admin)
    @Get()
    findAll() {
        return this.linkedAccountsService.findAll();
    }

    @UseGuards(JwtAuthGuard)
    @Get('user/:userId')
    findByUser(@Param('userId') userId: string) {
        return this.linkedAccountsService.findByUser(userId);
    }

    @UseGuards(JwtAuthGuard)
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.linkedAccountsService.findOne(id);
    }

    @UseGuards(JwtAuthGuard)
    @Post()
    create(@Body() createLinkedAccountDto: CreateLinkedAccountDto) {
        return this.linkedAccountsService.create(createLinkedAccountDto);
    }

    @UseGuards(JwtAuthGuard)
    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() updateLinkedAccountDto: UpdateLinkedAccountDto,
    ) {
        return this.linkedAccountsService.update(id, updateLinkedAccountDto);
    }

    @UseGuards(JwtAuthGuard)
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.linkedAccountsService.remove(id);
    }
}

