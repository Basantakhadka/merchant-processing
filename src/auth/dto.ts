import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'sales1@example.test' }) @IsEmail() email: string;
  @ApiProperty({ example: '<your-seeded-password>' }) @IsString() @MinLength(8) @MaxLength(128) password: string;
}

export class TokenResponseDto {
  @ApiProperty() accessToken: string;
  @ApiProperty({ example: 'Bearer' }) tokenType: string;
  @ApiProperty({ example: '15m' }) expiresIn: string;
}
