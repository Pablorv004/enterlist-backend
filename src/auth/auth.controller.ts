import { Controller, Post, Body, UseGuards, Req, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('api/auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    async register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    @UseGuards(LocalAuthGuard)
    @Post('login')
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }    @UseGuards(JwtAuthGuard)
    @Get('profile')
    getProfile(@Req() req: Request) {
        // Ensure we're returning a complete user object with all required fields
        const user = req.user;
        
        // Make sure user_id is properly set and valid
        if (!user ) {
            throw new Error('Invalid user data in JWT token');
        }
        
        return user;
    }
}
