import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ApplicationStatus, BusinessType, ReviewDecision, RiskStatus } from '../enums';

export class CreateApplicationDto {
  @ApiProperty({ example: 'Himalayan Coffee' }) @IsString() @IsNotEmpty() @MaxLength(200) businessName: string;
  @ApiProperty({ example: 'Himalayan Coffee Pvt. Ltd.' }) @IsString() @IsNotEmpty() @MaxLength(200) legalBusinessName: string;
  @ApiProperty({ enum: BusinessType }) @IsEnum(BusinessType) businessType: BusinessType;

  @ApiProperty({ example: 'Sita Sharma' }) @IsString() @IsNotEmpty() @MaxLength(150) ownerName: string;
  @ApiProperty({ example: 'sita@example.test' }) @IsEmail() ownerEmail: string;
  @ApiProperty({ example: '+9779800000000' }) @Matches(/^\+?[0-9 ()-]{7,20}$/, { message: 'ownerPhone must be a valid phone number' }) ownerPhone: string;
  @ApiPropertyOptional({ example: 'TEST-ID-1234567', description: 'Encrypted at rest; masked in responses. Use fake data only.' })
  @IsOptional() @IsString() @Length(4, 40) ownerNationalId?: string;

  @ApiProperty({ example: 50000 }) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(1_000_000_000) expectedMonthlyVolume: number;
  @ApiProperty({ example: 25.5 }) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(1_000_000) averageTicketSize: number;
  @ApiProperty({ example: 'NPR', description: 'ISO-4217 code' }) @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter uppercase ISO code' }) currency: string;
}

export class UpdateApplicationDto extends PartialType(CreateApplicationDto) {}

export class AssignReviewerDto {
  @ApiProperty({ description: 'User id of an active REVIEWER (see GET /users/reviewers)' }) @IsUUID() reviewerId: string;
}

export class DecisionDto {
  @ApiProperty({ enum: ReviewDecision }) @IsEnum(ReviewDecision) decision: ReviewDecision;
  @ApiPropertyOptional({ description: 'Required for REJECT and REQUEST_INFO' })
  @ValidateIf((o: DecisionDto) => o.decision !== ReviewDecision.APPROVE || o.notes !== undefined)
  @IsString() @IsNotEmpty() @MaxLength(2000) notes?: string;
}

export class ListApplicationsQuery {
  @ApiPropertyOptional({ enum: ApplicationStatus }) @IsOptional() @IsEnum(ApplicationStatus) status?: ApplicationStatus;
  @ApiPropertyOptional({ enum: RiskStatus }) @IsOptional() @IsEnum(RiskStatus) riskStatus?: RiskStatus;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
