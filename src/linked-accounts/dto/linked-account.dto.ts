import { IsNotEmpty, IsString, IsUUID, IsInt, IsOptional, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLinkedAccountDto {
    @IsUUID()
    @IsNotEmpty()
    user_id: string;

    @IsInt()
    @IsNotEmpty()
    platform_id: number;

    @IsString()
    @IsNotEmpty()
    external_user_id: string;

    @IsString()
    @IsNotEmpty()
    access_token: string;

    @IsString()
    @IsOptional()
    refresh_token?: string;

    @IsDate()
    @IsOptional()
    @Type(() => Date)
    token_expires_at?: Date;
}

export class UpdateLinkedAccountDto {
    @IsString()
    @IsOptional()
    access_token?: string;

    @IsString()
    @IsOptional()
    refresh_token?: string;

    @IsDate()
    @IsOptional()
    @Type(() => Date)
    token_expires_at?: Date;
}
