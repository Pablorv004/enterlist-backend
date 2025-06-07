import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  Post,
  Body,
} from '@nestjs/common';
import { Response } from 'express';
import { YoutubeAuthService } from './youtube-auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailConfirmedGuard } from '../auth/guards/email-confirmed.guard';
import { RoleRequiredGuard } from '../auth/guards/role-required.guard';
import { ConfigService } from '@nestjs/config';

@Controller('api/auth/youtube')
export class YoutubeAuthController {
  constructor(
    private readonly youtubeAuthService: YoutubeAuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('login')
  @UseGuards(JwtAuthGuard, EmailConfirmedGuard)
  async login(@Req() req, @Res() res: Response) {
    const authUrl = await this.youtubeAuthService.getAuthorizationUrl(
      req.user.user_id,
    );
    return res.redirect(authUrl);
  }

  @Get('login-url')
  @UseGuards(JwtAuthGuard, EmailConfirmedGuard)
  async getLoginUrl(@Req() req, @Query('mobile') mobile?: string) {
    const isMobile = mobile === 'true';
    const authUrl = await this.youtubeAuthService.getAuthorizationUrl(
      req.user.user_id,
      isMobile,
    );
    return { url: authUrl };
  }

  @Get('register-or-login')
  async registerOrLogin(
    @Res() res: Response,
    @Query('mobile') mobile?: string,
  ) {
    const isMobile = mobile === 'true';
    const authUrl = await this.youtubeAuthService.getAuthorizationUrl(
      undefined,
      isMobile,
    );
    return res.redirect(authUrl);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('mobile') mobile: string,
    @Req() req,
    @Res() res: Response,
  ) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    const isMobile =
      mobile === 'true' || req.headers['user-agent']?.includes('Capacitor');

    if (error) {
      if (isMobile) {
        return res.redirect(
          `com.enterlist.app://oauth/error?error=${encodeURIComponent(error)}&provider=youtube`,
        );
      }
      return res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent(error)}`,
      );
    }

    try {
      const result = await this.youtubeAuthService.handleCallback(code, state);

      const params = new URLSearchParams({
        access_token: result.access_token,
        user: JSON.stringify(result.user),
        status: 'success',
        provider: 'youtube',
        isNewUser: result.isNewUser?.toString() || 'false',
        needsRoleSelection: result.needsRoleSelection?.toString() || 'false',
      });

      if (isMobile) {
        return res.redirect(
          `com.enterlist.app://oauth/callback?${params.toString()}`,
        );
      }

      return res.redirect(`${frontendUrl}/oauth/callback?${params.toString()}`);
    } catch (err) {
      console.error('YouTube OAuth Error:', err);
      const errorMessage = err.message || 'Authentication failed';

      if (isMobile) {
        return res.redirect(
          `com.enterlist.app://oauth/error?error=${encodeURIComponent(errorMessage)}&provider=youtube`,
        );
      }

      return res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent(errorMessage)}`,
      );
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
      return res.redirect(
        `com.enterlist.app://oauth/error?error=${encodeURIComponent(error)}&provider=youtube`,
      );
    }

    try {
      const result = await this.youtubeAuthService.handleCallback(code, state);

      const params = new URLSearchParams({
        access_token: result.access_token,
        user: JSON.stringify(result.user),
        status: 'success',
        provider: 'youtube',
        isNewUser: result.isNewUser?.toString() || 'false',
        needsRoleSelection: result.needsRoleSelection?.toString() || 'false',
      });

      return res.redirect(
        `com.enterlist.app://oauth/callback?${params.toString()}`,
      );
    } catch (err) {
      console.error('YouTube Mobile OAuth Error:', err);
      const errorMessage = err.message || 'Authentication failed';
      return res.redirect(
        `com.enterlist.app://oauth/error?error=${encodeURIComponent(errorMessage)}&provider=youtube`,
      );
    }
  }

  @Get('playlists')
  @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard)
  async getPlaylists(
    @Req() req,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.youtubeAuthService.getUserPlaylists(
      req.user.user_id,
      limit,
      offset,
    );
  }

  @Get('channels')
  @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard)
  async getChannels(
    @Req() req,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.youtubeAuthService.getUserChannels(
      req.user.user_id,
      limit,
      offset,
    );
  }

  @Get('videos')
  @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard)
  async getUserVideos(
    @Req() req,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('musicOnly', new DefaultValuePipe(false)) musicOnly: boolean,
  ) {
    return this.youtubeAuthService.getUserVideos(
      req.user.user_id,
      limit,
      offset,
      musicOnly,
    );
  }

  @Get('songs')
  @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard)
  async getUserSongs(
    @Req() req,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.youtubeAuthService.getUserSongs(
      req.user.user_id,
      limit,
      offset,
    );
  }

  @Post('import/playlists')
  @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard)
  async importPlaylists(@Req() req, @Body() body: { playlistIds: string[] }) {
    return this.youtubeAuthService.importPlaylistsToDatabase(
      req.user.user_id,
      body.playlistIds,
    );
  }

  @Post('import/videos')
  @UseGuards(JwtAuthGuard, EmailConfirmedGuard, RoleRequiredGuard)
  async importVideos(@Req() req, @Body() body: { videoIds: string[] }) {
    return this.youtubeAuthService.importVideosToDatabase(
      req.user.user_id,
      body.videoIds,
    );
  }
}
