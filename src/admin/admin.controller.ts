import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    UseGuards,
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

    // Admin User Management
    @Get('users')
    getUsers(
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    ) {
        return this.adminService.getUsers(skip, take);
    }

    @Get('users/:id')
    getUser(@Param('id') id: string) {
        return this.adminService.getUser(id);
    }

    @Put('users/:id')
    updateUser(@Param('id') id: string, @Body() userData: any) {
        return this.adminService.updateUser(id, userData);
    }

    @Delete('users/:id')
    deleteUser(@Param('id') id: string) {
        return this.adminService.deleteUser(id);
    }

    @Post('users/:id/suspend')
    suspendUser(@Param('id') id: string, @Body() body: { reason: string }) {
        return this.adminService.suspendUser(id, body.reason);
    }

    @Post('users/:id/reactivate')
    reactivateUser(@Param('id') id: string) {
        return this.adminService.reactivateUser(id);
    }

    // Admin Playlist Management
    @Get('playlists')
    getPlaylists(
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    ) {
        return this.adminService.getPlaylists(skip, take);
    }

    @Get('playlists/:id')
    getPlaylist(@Param('id') id: string) {
        return this.adminService.getPlaylist(id);
    }

    @Put('playlists/:id')
    updatePlaylist(@Param('id') id: string, @Body() playlistData: any) {
        return this.adminService.updatePlaylist(id, playlistData);
    }

    @Delete('playlists/:id')
    deletePlaylist(@Param('id') id: string) {
        return this.adminService.deletePlaylist(id);
    }

    @Post('playlists/:id/flag')
    flagPlaylist(@Param('id') id: string, @Body() body: { reason: string }) {
        return this.adminService.flagPlaylist(id, body.reason);
    }

    @Post('playlists/:id/unflag')
    unflagPlaylist(@Param('id') id: string) {
        return this.adminService.unflagPlaylist(id);
    }

    // Admin Song Management
    @Get('songs')
    getSongs(
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    ) {
        return this.adminService.getSongs(skip, take);
    }

    @Get('songs/:id')
    getSong(@Param('id') id: string) {
        return this.adminService.getSong(id);
    }

    @Put('songs/:id')
    updateSong(@Param('id') id: string, @Body() songData: any) {
        return this.adminService.updateSong(id, songData);
    }

    @Delete('songs/:id')
    deleteSong(@Param('id') id: string) {
        return this.adminService.deleteSong(id);
    }

    @Post('songs/:id/flag')
    flagSong(@Param('id') id: string, @Body() body: { reason: string }) {
        return this.adminService.flagSong(id, body.reason);
    }

    @Post('songs/:id/unflag')
    unflagSong(@Param('id') id: string) {
        return this.adminService.unflagSong(id);
    }

    // Admin Submission Management
    @Get('submissions')
    getSubmissions(
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
        @Query('status') status?: string,
    ) {
        return this.adminService.getSubmissions(skip, take, status);
    }

    @Get('submissions/:id')
    getSubmission(@Param('id') id: string) {
        return this.adminService.getSubmission(id);
    }

    @Put('submissions/:id')
    updateSubmission(@Param('id') id: string, @Body() submissionData: any) {
        return this.adminService.updateSubmission(id, submissionData);
    }

    @Delete('submissions/:id')
    deleteSubmission(@Param('id') id: string) {
        return this.adminService.deleteSubmission(id);
    }

    // Admin Transaction Management
    @Get('transactions')
    getTransactions(
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
        @Query('status') status?: string,
    ) {
        return this.adminService.getTransactions(skip, take, status);
    }

    @Get('transactions/:id')
    getTransaction(@Param('id') id: string) {
        return this.adminService.getTransaction(id);
    }

    // Admin Platform Management
    @Get('platforms')
    getPlatforms() {
        return this.adminService.getPlatforms();
    }

    @Post('platforms')
    createPlatform(@Body() platformData: any) {
        return this.adminService.createPlatform(platformData);
    }

    @Get('platforms/:id')
    getPlatform(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.getPlatform(id);
    }

    @Put('platforms/:id')
    updatePlatform(@Param('id', ParseIntPipe) id: number, @Body() platformData: any) {
        return this.adminService.updatePlatform(id, platformData);
    }

    @Delete('platforms/:id')
    deletePlatform(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.deletePlatform(id);
    }

    // Admin Linked Accounts Management
    @Get('linked-accounts')
    getLinkedAccounts(
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    ) {
        return this.adminService.getLinkedAccounts(skip, take);
    }

    @Get('linked-accounts/:id')
    getLinkedAccount(@Param('id') id: string) {
        return this.adminService.getLinkedAccount(id);
    }

    @Put('linked-accounts/:id')
    updateLinkedAccount(@Param('id') id: string, @Body() linkedAccountData: any) {
        return this.adminService.updateLinkedAccount(id, linkedAccountData);
    }

    @Delete('linked-accounts/:id')
    deleteLinkedAccount(@Param('id') id: string) {
        return this.adminService.deleteLinkedAccount(id);
    }

    // Admin Payment Methods Management
    @Get('payment-methods')
    getPaymentMethods(
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    ) {
        return this.adminService.getPaymentMethods(skip, take);
    }

    @Get('payment-methods/:id')
    getPaymentMethod(@Param('id') id: string) {
        return this.adminService.getPaymentMethod(id);
    }

    @Put('payment-methods/:id')
    updatePaymentMethod(@Param('id') id: string, @Body() paymentMethodData: any) {
        return this.adminService.updatePaymentMethod(id, paymentMethodData);
    }

    @Delete('payment-methods/:id')
    deletePaymentMethod(@Param('id') id: string) {
        return this.adminService.deletePaymentMethod(id);
    }
}
