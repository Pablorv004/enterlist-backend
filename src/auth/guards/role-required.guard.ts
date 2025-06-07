import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RoleRequiredGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const response: Response = context.switchToHttp().getResponse();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // If user doesn't have a role, redirect to role selection
    if (!user.role) {
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:5173';

      // For API requests, throw an exception with a specific message
      if (
        request.headers['content-type']?.includes('application/json') ||
        request.headers['accept']?.includes('application/json')
      ) {
        throw new ForbiddenException('Role selection required');
      }

      // For web requests, redirect to role selection
      response.redirect(
        `${frontendUrl}/role-selection?redirect=${encodeURIComponent(request.url)}`,
      );
      return false;
    }

    return true;
  }
}
