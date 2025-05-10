import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
        constructor(
            private readonly configService: ConfigService,
            private readonly prismaService: PrismaService,
        ) {
            const secretKey = configService.get<string>('JWT_SECRET');
            if (!secretKey) {
                throw new Error('JWT_SECRET is not defined in environment variables');
            }

            super({
                jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
                ignoreExpiration: false,
                secretOrKey: secretKey,
            });
        }

    async validate(payload: { sub: string; email: string }) {
        const user = await this.prismaService.user.findUnique({
            where: { user_id: payload.sub },
        });

        if (!user || !user.is_active) {
            throw new UnauthorizedException('User not found or inactive');
        }

        return user;
    }
}
