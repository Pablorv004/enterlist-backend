import {
    IsNotEmpty,
    IsString,
    IsUUID,
    IsInt,
    IsOptional,
    IsBoolean,
    IsPositive,
} from 'class-validator';

export class CreateSongDto {
    @IsUUID()
    @IsNotEmpty()
    artist_id: string;

    @IsInt()
    @IsNotEmpty()
    platform_id: number;

    @IsString()
    @IsNotEmpty()
    platform_specific_id: string;

    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    artist_name_on_platform: string;

    @IsString()
    @IsOptional()
    album_name?: string;

    @IsString()
    @IsOptional()
    url?: string;

    @IsString()
    @IsOptional()
    cover_image_url?: string;

    @IsPositive()
    @IsOptional()
    duration_ms?: number;

    @IsBoolean()
    @IsOptional()
    is_visible?: boolean;
}

export class UpdateSongDto {
    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    artist_name_on_platform?: string;

    @IsString()
    @IsOptional()
    album_name?: string;

    @IsString()
    @IsOptional()
    url?: string;

    @IsString()
    @IsOptional()
    cover_image_url?: string;

    @IsPositive()
    @IsOptional()
    duration_ms?: number;

    @IsBoolean()
    @IsOptional()
    is_visible?: boolean;
}
