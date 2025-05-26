import { Controller, Get, Query, Req, Res, UseGuards, ParseIntPipe, DefaultValuePipe, Post, Body } from '@nestjs/common';
import { Response } from 'express';
import { SpotifyAuthService } from './spotify-auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleRequiredGuard } from '../auth/guards/role-required.guard';
import { ConfigService } from '@nestjs/config';

@Controller('api/auth/spotify')
export class SpotifyAuthController {
    constructor(
        private readonly spotifyAuthService: SpotifyAuthService,
        private readonly configService: ConfigService
    ) { }

    @Get('login')
    @UseGuards(JwtAuthGuard)
    async login(@Req() req, @Res() res: Response) {
        const authUrl = await this.spotifyAuthService.getAuthorizationUrl(req.user.user_id);
        return res.redirect(authUrl);
    }    @Get('login-url')
    @UseGuards(JwtAuthGuard)
    async getLoginUrl(@Req() req) {
        const authUrl = await this.spotifyAuthService.getAuthorizationUrl(req.user.user_id);
        return { url: authUrl };
    }

    @Get('register-or-login')
    async registerOrLogin(@Res() res: Response) {
        // This endpoint doesn't require authentication as it's for new users
        const authUrl = await this.spotifyAuthService.getAuthorizationUrl();
        return res.redirect(authUrl);
    }    @Get('callback')
    async callback(
        @Query('code') code: string,
        @Query('state') state: string,
        @Query('error') error: string,
        @Query('mobile') mobile: string,
        @Req() req,
        @Res() res: Response,
    ) {
        const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
        const isMobile = mobile === 'true' || req.headers['user-agent']?.includes('Capacitor');
        
        if (error) {
            if (isMobile) {
                return res.redirect(`enterlist://oauth/error?error=${encodeURIComponent(error)}`);
            }
            return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error)}`);
        }

        try {
            const result = await this.spotifyAuthService.handleCallback(code, state);
            
            // Create common parameters for both mobile and web
            const params = new URLSearchParams({
                access_token: result.access_token,
                user: JSON.stringify(result.user),
                status: 'success',
                provider: 'spotify',
                isNewUser: result.isNewUser?.toString() || 'false',
                needsRoleSelection: result.needsRoleSelection?.toString() || 'false'
            });
            
            if (isMobile) {
                // For mobile, redirect with tokens in URL parameters
                return res.redirect(`enterlist://oauth/callback?${params.toString()}`);
            }
            
            // Web flow - use query parameters instead of cookies
            // Check if this is a new user or existing user that needs role selection
            if (result.isNewUser || result.needsRoleSelection) {
                return res.redirect(`${frontendUrl}/role-selection`);
            }
            
            // If existing user with role, go to dashboard
            return res.redirect(`${frontendUrl}/dashboard?${params.toString()}`);
        } catch (err) {
            if (isMobile) {
                return res.redirect(`enterlist://oauth/error?error=${encodeURIComponent(err.message)}`);
            }
            return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(err.message)}`);
        }
    }@Get('playlists')
    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    async getPlaylists(
        @Req() req,
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    ) {
        return this.spotifyAuthService.getUserPlaylists(req.user.user_id, limit, offset);
    }    @Get('tracks')
    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    async getUserTracks(
        @Req() req,
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    ) {
        return this.spotifyAuthService.getUserTracks(req.user.user_id, limit, offset);
    }    @Post('import/playlists')
    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    async importPlaylists(
        @Req() req,
        @Body() body: { playlistIds: string[] }
    ) {
        return this.spotifyAuthService.importPlaylistsToDatabase(req.user.user_id, body.playlistIds);
    }    @Post('import/tracks')
    @UseGuards(JwtAuthGuard, RoleRequiredGuard)
    async importTracks(
        @Req() req,
        @Body() body: { trackIds: string[] }
    ) {
        return this.spotifyAuthService.importTracksToDatabase(req.user.user_id, body.trackIds);
    }
}
