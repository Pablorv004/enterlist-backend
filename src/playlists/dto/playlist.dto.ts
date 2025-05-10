import {
    IsNotEmpty,
    IsString,
    IsUUID,
    IsInt,
    IsOptional,
    IsBoolean,
    IsPositive
} from 'class-validator';

export class CreatePlaylistDto {
    @IsUUID()
    @IsNotEmpty()
    creator_id: string;

    @IsInt()
    @IsNotEmpty()
    platform_id: number;

    @IsString()
    @IsNotEmpty()
    platform_specific_id: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    url?: string;

    @IsString()
    @IsOptional()
    cover_image_url?: string;

    @IsBoolean()
    @IsOptional()
    is_visible?: boolean;

    @IsString()
    @IsOptional()
    genre?: string;

    @IsPositive()
    @IsOptional()
    follower_count?: number;
}

export class UpdatePlaylistDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    url?: string;

    @IsString()
    @IsOptional()
    cover_image_url?: string;

    @IsBoolean()
    @IsOptional()
    is_visible?: boolean;

    @IsString()
    @IsOptional()
    genre?: string;

    @IsPositive()
    @IsOptional()
    follower_count?: number;
}
