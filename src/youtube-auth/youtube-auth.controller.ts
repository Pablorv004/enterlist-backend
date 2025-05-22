import { Controller, Get, Query, Req, Res, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { Response } from 'express';
import { YoutubeAuthService } from './youtube-auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/auth/youtube')
export class YoutubeAuthController {
    constructor(private readonly youtubeAuthService: YoutubeAuthService) { }    @Get('login')
    async login(@Req() req, @Res() res: Response) {
        try {
            // Extract user_id from token if available
            const userId = req.user?.user_id;
            const authUrl = await this.youtubeAuthService.getAuthorizationUrl(userId);
            return res.json({ url: authUrl });
        } catch (error) {
            console.error('YouTube auth error:', error);
            return res.status(500).json({ error: 'Failed to get YouTube authorization URL' });
        }
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
        if (error) {
            return res.status(400).json({ error, message: 'Authorization failed' });
        }

        try {
            const result = await this.youtubeAuthService.handleCallback(code, state);
            return res.status(200).json({ success: true, result });
        } catch (err) {
            return res.status(400).json({ error: err.message });
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
