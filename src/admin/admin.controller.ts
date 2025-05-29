import {
    Controller,
    Get,
    UseGuards,
    Put,
    Param,
    Body,
    Query,
    ParseIntPipe,
    DefaultValuePipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailConfirmedGuard } from '../auth/guards/email-confirmed.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { user_role } from '@prisma/client';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard, RolesGuard)
@Roles(user_role.admin)
export class AdminController {
    constructor(private readonly adminService: AdminService) { }    @Get('statistics')
    getStatistics() {
        return this.adminService.getStatistics();
    }

    @Get('dashboard-stats')
    getDashboardStats() {
        return this.adminService.getStatistics();
    }    @Get('dashboard')
    getDashboardData() {
        return this.adminService.getDashboardData();
    }
    @Get('withdrawals')
    getWithdrawals(
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
        @Query('status') status?: 'pending' | 'processing' | 'completed' | 'failed'
    ) {
        return this.adminService.getWithdrawals(skip, take, status);
    }    @Put('withdrawals/:id/process')
    processWithdrawal(
        @Param('id') id: string,
        @Body() body: { status: 'completed' | 'failed'; notes?: string }
    ) {
        return this.adminService.processWithdrawal(id, body.status);
    }
}
