import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class EmailConfirmedGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if the route is marked to skip email confirmation
    const skipEmailConfirmation = this.reflector.get<boolean>(
      'skipEmailConfirmation',
      context.getHandler(),
    );
    if (skipEmailConfirmation) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.user_id) {
      return false;
    }

    // Use the user data already fetched by JWT strategy (no need for another DB query)
    // OAuth users are automatically considered email confirmed
    if (user.oauth_provider) {
      return true;
    }

    // Regular users must have confirmed email
    if (!user.email_confirmed) {
      throw new ForbiddenException(
        'Please confirm your email address before accessing this feature',
      );
    }

    return true;
  }
}
