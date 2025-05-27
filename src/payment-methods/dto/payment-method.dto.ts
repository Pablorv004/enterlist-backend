import {
    IsNotEmpty,
    IsString,
    IsUUID,
    IsEnum,
    IsOptional,
    IsBoolean
} from 'class-validator';
import { payment_method_type } from '@prisma/client';

export class CreatePaymentMethodDto {
    @IsUUID()
    @IsNotEmpty()
    user_id: string;

    @IsEnum(payment_method_type)
    @IsNotEmpty()
    type: payment_method_type;

    @IsString()
    @IsNotEmpty()
    provider_token: string;

    @IsString()
    @IsNotEmpty()
    details: string;

    @IsBoolean()
    @IsOptional()
    is_default?: boolean = false;
}

export class UpdatePaymentMethodDto {
    @IsString()
    @IsOptional()
    provider_token?: string;

    @IsString()
    @IsOptional()
    details?: string;

    @IsBoolean()
    @IsOptional()
    is_default?: boolean;
}

