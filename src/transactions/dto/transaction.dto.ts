import {
  IsNotEmpty,
  IsString,
  IsUUID,
  IsEnum,
  IsOptional,
  IsNumber,
  Min,
  Length,
} from 'class-validator';
import { transaction_status } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateTransactionDto {
  @IsUUID()
  @IsNotEmpty()
  submission_id: string;

  @IsUUID()
  @IsNotEmpty()
  payment_method_id: string;

  @IsNumber()
  @Type(() => Number)
  @Min(0.01)
  amount_total: number;

  @IsString()
  @Length(3, 3)
  currency: string;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  platform_fee: number;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  creator_payout_amount: number;

  @IsEnum(transaction_status)
  @IsNotEmpty()
  status: transaction_status;

  @IsString()
  @IsOptional()
  payment_provider_transaction_id?: string;
}

export class UpdateTransactionDto {
  @IsEnum(transaction_status)
  @IsOptional()
  status?: transaction_status;

  @IsString()
  @IsOptional()
  payment_provider_transaction_id?: string;
}
