import { Controller, Get, Query, Req, Res, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { Response } from 'express';
import { YoutubeAuthService } from './youtube-auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';

@Controller('api/auth/youtube')
export class YoutubeAuthController {
    constructor(
        private readonly youtubeAuthService: YoutubeAuthService,
        private readonly configService: ConfigService
    ) { }

    @Get('login')
    @UseGuards(JwtAuthGuard)
    async login(@Req() req, @Res() res: Response) {
        const authUrl = await this.youtubeAuthService.getAuthorizationUrl(req.user.user_id);
        return res.redirect(authUrl);
    }

    @Get('register-or-login')
    async registerOrLogin(@Res() res: Response) {
        // This endpoint doesn't require authentication as it's for new users
        const authUrl = await this.youtubeAuthService.getAuthorizationUrl();
        return res.redirect(authUrl);
    }    @Get('callback')
    async callback(
        @Query('code') code: string,
        @Query('state') state: string,
        @Query('error') error: string,
        @Res() res: Response,
    ) {
        const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
        
        if (error) {
            return res.redirect(`${frontendUrl}/dashboard?error=${error}`);
        }

        try {
            const result = await this.youtubeAuthService.handleCallback(code, state);
            
            // Check if this is a new user that needs role selection
            if (result.isNewUser) {
                return res.redirect(`${frontendUrl}/role-selection?provider=youtube&status=success`);
            }
            
            // If not a new user or role already set, go to dashboard
            return res.redirect(`${frontendUrl}/dashboard?status=success&provider=youtube`);
        } catch (err) {
            return res.redirect(`${frontendUrl}/dashboard?error=${encodeURIComponent(err.message)}`);
        }
    }

    @Get('playlists')
    @UseGuards(JwtAuthGuard)
    async getPlaylists(
        @Req() req,
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    ) {
        return this.youtubeAuthService.getUserPlaylists(req.user.user_id, limit, offset);
    }

    @Get('channels')
    @UseGuards(JwtAuthGuard)
    async getChannels(
        @Req() req,
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    ) {
        return this.youtubeAuthService.getUserChannels(req.user.user_id, limit, offset);
    }

    @Get('videos')
    @UseGuards(JwtAuthGuard)
    async getUserVideos(
        @Req() req,
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    ) {
        return this.youtubeAuthService.getUserVideos(req.user.user_id, limit, offset);
    }
}
