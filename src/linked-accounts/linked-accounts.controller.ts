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
import { RoleRequiredGuard } from '../auth/guards/role-required.guard';
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

    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    @Get('user/:userId')
    findByUser(@Param('userId') userId: string) {
        return this.linkedAccountsService.findByUser(userId);
    }

    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.linkedAccountsService.findOne(id);
    }

    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    @Post()
    create(@Body() createLinkedAccountDto: CreateLinkedAccountDto) {
        return this.linkedAccountsService.create(createLinkedAccountDto);
    }

    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() updateLinkedAccountDto: UpdateLinkedAccountDto,
    ) {
        return this.linkedAccountsService.update(id, updateLinkedAccountDto);
    }

    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.linkedAccountsService.remove(id);
    }
}

