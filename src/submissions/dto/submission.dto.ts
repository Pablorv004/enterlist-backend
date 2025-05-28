import {
    IsNotEmpty,
    IsString,
    IsUUID,
    IsEnum,
    IsOptional,
    IsDate
} from 'class-validator';
import { submission_status } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateSubmissionDto {
    @IsUUID()
    @IsNotEmpty()
    artist_id: string;

    @IsUUID()
    @IsNotEmpty()
    playlist_id: string;

    @IsUUID()
    @IsNotEmpty()
    song_id: string;

    @IsString()
    @IsOptional()
    submission_message?: string;
}

export class UpdateSubmissionDto {
    @IsEnum(submission_status)
    @IsOptional()
    status?: submission_status;

    @IsString()
    @IsOptional()
    review_feedback?: string;

    @IsDate()
    @IsOptional()
    @Type(() => Date)
    reviewed_at?: Date;
}

