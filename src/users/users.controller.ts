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
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UpdateRoleDto } from './dto/user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RoleRequiredGuard } from '../auth/guards/role-required.guard';
import { EmailConfirmedGuard } from '../auth/guards/email-confirmed.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { user_role } from '@prisma/client';

@Controller('api/users')
export class UsersController {    constructor(private readonly usersService: UsersService) { } @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RolesGuard)
    @Roles(user_role.admin)
    @Get()
    findAll(
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    ) {
        return this.usersService.findAll(skip, take);
    }    @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard)
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.usersService.findOne(id);
    } @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RolesGuard)
    @Roles(user_role.admin)
    @Post()
    create(@Body() createUserDto: CreateUserDto) {
        return this.usersService.create(createUserDto);
    }

    @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard)
    @Put(':id')
    update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
        return this.usersService.update(id, updateUserDto);
    }

    @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard)
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.usersService.remove(id);
    }    @UseGuards(JwtAuthGuard, EmailConfirmedGuard)
    @Put('role/update')
    updateRole(@Req() req, @Body() updateRoleDto: UpdateRoleDto) {
        return this.usersService.updateRole(req.user.user_id, updateRoleDto.role);
    }

    @UseGuards(JwtAuthGuard, EmailConfirmedGuard)
    @Post('select-role')
    selectRole(@Req() req, @Body() updateRoleDto: UpdateRoleDto) {
        return this.usersService.updateRole(req.user.user_id, updateRoleDto.role);
    }

    // Profile-related endpoints
    @UseGuards(JwtAuthGuard, EmailConfirmedGuard)
    @Get('profile/statistics')
    getProfileStatistics(@Req() req) {
        return this.usersService.getProfileStatistics(req.user.user_id);
    }

    @UseGuards(JwtAuthGuard, EmailConfirmedGuard)
    @Put('profile/deactivate')
    deactivateAccount(@Req() req) {
        return this.usersService.deactivateAccount(req.user.user_id);
    }@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
    @Put('profile/password')
    updatePassword(@Req() req, @Body() body: { currentPassword: string; newPassword: string }) {
        return this.usersService.updatePassword(req.user.user_id, body.currentPassword, body.newPassword);
    }
}
