import { IsEmail, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { user_role } from '@prisma/client';

export class CreateUserDto {
    @IsString()
    username: string;

    @IsEmail()
    email: string;

    @IsString()
    password: string;
    @IsEnum(user_role)
    role: user_role;

    @IsString()
    @IsOptional()
    oauth_provider?: string;

    @IsString()
    @IsOptional()
    oauth_id?: string;
}

export class UpdateUserDto {
    @IsString()
    @IsOptional()
    username?: string;

    @IsEmail()
    @IsOptional()
    email?: string;

    @IsString()
    @IsOptional()
    password?: string;
    @IsEnum(user_role)
    @IsOptional()
    role?: user_role;

    @IsString()
    @IsOptional()
    oauth_provider?: string;

    @IsString()
    @IsOptional()
    oauth_id?: string;

    @IsOptional()
    is_active?: boolean;
}

export class UserIdDto {
    @IsUUID()
    user_id: string;
}

export class UpdateRoleDto {
    @IsEnum(user_role)
    role: user_role;
}

