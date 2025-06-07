import {
  IsNotEmpty,
  IsString,
  IsUUID,
  IsInt,
  IsOptional,
  IsBoolean,
  IsPositive,
  IsDecimal,
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

  @IsDecimal()
  @IsOptional()
  submission_fee?: number;

  @IsBoolean()
  @IsOptional()
  is_visible?: boolean;
  @IsString()
  @IsOptional()
  genre?: string;

  @IsInt()
  @IsOptional()
  track_count?: number;
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

  @IsDecimal()
  @IsOptional()
  submission_fee?: number;
  @IsString()
  @IsOptional()
  genre?: string;

  @IsBoolean()
  @IsOptional()
  deleted?: boolean;

  @IsInt()
  @IsOptional()
  track_count?: number;
}
