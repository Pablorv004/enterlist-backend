import { IsEmail, IsNotEmpty, IsString, MinLength, IsEnum, IsOptional } from 'class-validator';
import { user_role } from '@prisma/client';

export class LoginDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    password: string;
}

export class RegisterDto {
    @IsString()
    @IsNotEmpty()
    username: string;

    @IsEmail()
    @IsNotEmpty()
    email: string;    
    
    @IsString()
    @MinLength(8)
    password: string;    
      @IsEnum(user_role)
    @IsOptional()
    role?: user_role;

    @IsString()
    @IsOptional()
    oauth_provider?: string;

    @IsString()
    @IsOptional()
    oauth_id?: string;
}
