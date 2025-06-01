import { Controller, Get, Query, Req, Res, UseGuards, ParseIntPipe, DefaultValuePipe, Post, Body } from '@nestjs/common';
import { Response } from 'express';
import { SpotifyAuthService } from './spotify-auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailConfirmedGuard } from '../auth/guards/email-confirmed.guard';
import { RoleRequiredGuard } from '../auth/guards/role-required.guard';
import { ConfigService } from '@nestjs/config';

@Controller('api/auth/spotify')
export class SpotifyAuthController {
    constructor(
        private readonly spotifyAuthService: SpotifyAuthService,
        private readonly configService: ConfigService
    ) { }    @Get('login')
    @UseGuards(JwtAuthGuard, EmailConfirmedGuard)
    async login(@Req() req, @Res() res: Response) {
        const authUrl = await this.spotifyAuthService.getAuthorizationUrl(req.user.user_id);
        return res.redirect(authUrl);
    }    @Get('login-url')
    @UseGuards(JwtAuthGuard, EmailConfirmedGuard)
    async getLoginUrl(@Req() req, @Query('mobile') mobile?: string) {
        const isMobile = mobile === 'true';
        const authUrl = await this.spotifyAuthService.getAuthorizationUrl(req.user.user_id, isMobile);
        return { url: authUrl };
    }    
    @Get('register-or-login')
    async registerOrLogin(@Res() res: Response, @Query('mobile') mobile?: string) {
        // This endpoint doesn't require authentication as it's for new users
        const isMobile = mobile === 'true';
        const authUrl = await this.spotifyAuthService.getAuthorizationUrl(undefined, isMobile);
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
        
        // Detect if this is a mobile request
        const isMobile = mobile === 'true' || req.headers['user-agent']?.includes('Capacitor');
        
        if (error) {
            if (isMobile) {
                return res.redirect(`com.enterlist.app://oauth/error?error=${encodeURIComponent(error)}&provider=spotify`);
            }
            return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error)}`);
        }

        try {
            const result = await this.spotifyAuthService.handleCallback(code, state);
            
            const params = new URLSearchParams({
                access_token: result.access_token,
                user: JSON.stringify(result.user),
                status: 'success',
                provider: 'spotify',
                isNewUser: result.isNewUser?.toString() || 'false',
                needsRoleSelection: result.needsRoleSelection?.toString() || 'false'
            });

            if (isMobile) {
                return res.redirect(`com.enterlist.app://oauth/callback?${params.toString()}`);
            }
            
            return res.redirect(`${frontendUrl}/oauth/callback?${params.toString()}`);
        } catch (err) {
            console.error('Spotify OAuth Error:', err);
            const errorMessage = err.message || 'Authentication failed';
            
            if (isMobile) {
                return res.redirect(`com.enterlist.app://oauth/error?error=${encodeURIComponent(errorMessage)}&provider=spotify`);
            }
            
            return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(errorMessage)}`);
        }
    }

    @Get('mobile-callback')
    async mobileCallback(
        @Query('code') code: string,
        @Query('state') state: string,
        @Query('error') error: string,
        @Req() req,
        @Res() res: Response,
    ) {
        if (error) {
            return res.redirect(`com.enterlist.app://oauth/error?error=${encodeURIComponent(error)}&provider=spotify`);
        }

        try {
            const result = await this.spotifyAuthService.handleCallback(code, state);
            
            const params = new URLSearchParams({
                access_token: result.access_token,
                user: JSON.stringify(result.user),
                status: 'success',
                provider: 'spotify',
                isNewUser: result.isNewUser?.toString() || 'false',
                needsRoleSelection: result.needsRoleSelection?.toString() || 'false'
            });

            return res.redirect(`com.enterlist.app://oauth/callback?${params.toString()}`);
        } catch (err) {
            console.error('Spotify Mobile OAuth Error:', err);
            const errorMessage = err.message || 'Authentication failed';
            return res.redirect(`com.enterlist.app://oauth/error?error=${encodeURIComponent(errorMessage)}&provider=spotify`);
        }
    }    @Get('playlists')
    @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard)
    async getPlaylists(
        @Req() req,
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    ) {
        return this.spotifyAuthService.getUserPlaylists(req.user.user_id, limit, offset);
    }    @Get('tracks')
    @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard)
    async getUserTracks(
        @Req() req,
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    ) {
        return this.spotifyAuthService.getUserTracks(req.user.user_id, limit, offset);
    }    @Post('import/playlists')
    @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard)
    async importPlaylists(
        @Req() req,
        @Body() body: { playlistIds: string[] }
    ) {
        return this.spotifyAuthService.importPlaylistsToDatabase(req.user.user_id, body.playlistIds);
    }    @Post('import/tracks')
    @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard)
    async importTracks(
        @Req() req,
        @Body() body: { trackIds: string[] }
    ) {
        return this.spotifyAuthService.importTracksToDatabase(req.user.user_id, body.trackIds);
    }
}
