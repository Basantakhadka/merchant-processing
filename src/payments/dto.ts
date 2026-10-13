import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Length, Max, MaxLength } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ example: 1500.5, description: 'Amount in the application currency (2 decimals max)' })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(1_000_000_000) amount: number;
  @ApiPropertyOptional({ example: 'Onboarding fee' }) @IsOptional() @IsString() @MaxLength(200) description?: string;
}

export class WebhookEventDto {
  @ApiProperty({ example: 'evt_0001abcd', description: 'Unique per provider event; used for idempotency' })
  @IsString() @Length(8, 100) eventId: string;
  @ApiProperty({ description: 'providerReference of the payment' }) @IsString() @IsNotEmpty() @MaxLength(100) providerReference: string;
  @ApiProperty({ enum: ['SUCCEEDED', 'FAILED'] }) @IsIn(['SUCCEEDED', 'FAILED']) status: 'SUCCEEDED' | 'FAILED';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) failureReason?: string;
}

export class SimulateCallbackDto {
  @ApiProperty({ enum: ['SUCCEEDED', 'FAILED'] }) @IsIn(['SUCCEEDED', 'FAILED']) status: 'SUCCEEDED' | 'FAILED';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) failureReason?: string;
}
