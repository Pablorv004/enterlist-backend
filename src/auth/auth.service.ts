import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly jwtService: JwtService,
    ) { }

    async register(registerDto: RegisterDto) {
        const { email, username, password, role } = registerDto;

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
        }

        const passwordHash = await this.hashPassword(password);

        const user = await this.prismaService.user.create({
            data: {
                user_id: uuidv4(),
                email,
                username,
                password_hash: passwordHash,
                role,
                oauth_provider: registerDto.oauth_provider,
                oauth_id: registerDto.oauth_id,
                created_at: new Date(),
                updated_at: new Date(),
            },
        });

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
    }

    private async hashPassword(password: string): Promise<string> {
        const saltRounds = 10;
        return bcrypt.hash(password, saltRounds);
    }    generateToken(user: User) {
        const payload = {
            sub: user.user_id,
            email: user.email,
            role: user.role,
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
