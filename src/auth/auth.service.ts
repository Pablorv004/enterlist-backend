import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly jwtService: JwtService,
        private readonly emailService: EmailService,
    ) { }async register(registerDto: RegisterDto) {
        const { email, username, password } = registerDto;

        // For OAuth users, check if they already exist first by oauth_provider and oauth_id
        if (registerDto.oauth_provider && registerDto.oauth_id) {
            const existingOAuthUser = await this.prismaService.user.findFirst({
                where: {
                    oauth_provider: registerDto.oauth_provider,
                    oauth_id: registerDto.oauth_id,
                },
            });

            if (existingOAuthUser) {
                // OAuth user already exists, just return their token
                return this.generateToken(existingOAuthUser);
            }
        }

        // For regular users or new OAuth users, check for email/username conflicts
        const existingUser = await this.prismaService.user.findFirst({
            where: {
                OR: [
                    { email },
                    { username },
                ],
            },
        });

        if (existingUser) {
            throw new ConflictException(
                existingUser.email === email
                    ? 'Email already in use'
                    : 'Username already taken'
            );
        }        const passwordHash = await this.hashPassword(password);
        const emailConfirmationToken = uuidv4();

        const userData: any = {
            user_id: uuidv4(),
            email,
            username,
            password_hash: passwordHash,
            email_confirmed: false,
            email_confirmation_token: emailConfirmationToken,
            oauth_provider: registerDto.oauth_provider,
            oauth_id: registerDto.oauth_id,
            created_at: new Date(),
            updated_at: new Date(),
            // No role assigned by default - users will select role after registration
        };

        const user = await this.prismaService.user.create({
            data: userData,
        });

        // Send email confirmation email (only for non-OAuth users)
        if (!registerDto.oauth_provider) {
            await this.emailService.sendEmailConfirmation(
                user.email,
                user.username,
                emailConfirmationToken
            );
        }

        return this.generateToken(user);
    }

    async login(loginDto: LoginDto) {
        const user = await this.validateUser(loginDto.email, loginDto.password);

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        return this.generateToken(user);
    }

    async validateUser(email: string, password: string) {
        const user = await this.prismaService.user.findUnique({
            where: { email },
        });

        if (!user || !user.password_hash) {
            return null;
        }

        const isPasswordValid = await bcrypt.compare(
            password,
            user.password_hash,
        );

        if (!isPasswordValid) {
            return null;
        }

        return user;
    }    private async hashPassword(password: string): Promise<string> {
        const saltRounds = 10;
        return bcrypt.hash(password, saltRounds);
    }

    generateToken(user: User) {
        const payload = {
            sub: user.user_id,
            email: user.email,
            role: user.role || null,
        };

        return {
            access_token: this.jwtService.sign(payload),
            user: {
                id: user.user_id,
                username: user.username,
                email: user.email,
                role: user.role,
            },
        };
    }
}
