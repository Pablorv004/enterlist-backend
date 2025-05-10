import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePlatformDto {
    @IsString()
    @IsNotEmpty()
    name: string;
}

export class UpdatePlatformDto {
    @IsString()
    @IsNotEmpty()
    name: string;
}
