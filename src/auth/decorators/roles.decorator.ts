import { SetMetadata } from '@nestjs/common';
import { user_role } from '@prisma/client';

export const Roles = (...roles: user_role[]) => SetMetadata('roles', roles);
