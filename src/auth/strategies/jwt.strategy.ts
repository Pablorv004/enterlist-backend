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
    // Validate that sub is a properly formatted UUID
    if (
      !payload.sub ||
      typeof payload.sub !== 'string' ||
      payload.sub === 'undefined'
    ) {
      throw new UnauthorizedException('Invalid user ID in token');
    }
    const user = await this.prismaService.user.findUnique({
      where: { user_id: payload.sub },
      select: {
        user_id: true,
        username: true,
        email: true,
        role: true,
        is_active: true,
        oauth_provider: true,
        oauth_id: true,
        email_confirmed: true,
      },
    });

    if (!user || !user.is_active) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return user;
  }
}
