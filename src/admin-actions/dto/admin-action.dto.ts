import {
    IsNotEmpty,
    IsString,
    IsUUID,
    IsOptional
} from 'class-validator';

export class CreateAdminActionDto {
    @IsUUID()
    @IsNotEmpty()
    admin_user_id: string;

    @IsString()
    @IsNotEmpty()
    action_type: string;

    @IsUUID()
    @IsOptional()
    target_user_id?: string;

    @IsUUID()
    @IsOptional()
    target_playlist_id?: string;

    @IsUUID()
    @IsOptional()
    target_song_id?: string;

    @IsString()
    @IsOptional()
    reason?: string;
}
