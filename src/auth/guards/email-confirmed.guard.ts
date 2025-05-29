import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EmailConfirmedGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prismaService: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if the route is marked to skip email confirmation
    const skipEmailConfirmation = this.reflector.get<boolean>('skipEmailConfirmation', context.getHandler());
    if (skipEmailConfirmation) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.user_id) {
      return false;
    }

    // Get user from database to check email confirmation status
    const dbUser = await this.prismaService.user.findUnique({
      where: { user_id: user.user_id },
      select: { email_confirmed: true, oauth_provider: true }
    });

    if (!dbUser) {
      return false;
    }

    // OAuth users are automatically considered email confirmed
    if (dbUser.oauth_provider) {
      return true;
    }

    // Regular users must have confirmed email
    if (!dbUser.email_confirmed) {
      throw new ForbiddenException('Please confirm your email address before accessing this feature');
    }

    return true;
  }
}
