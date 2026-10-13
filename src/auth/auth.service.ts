import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuditAction } from '../audit/audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { LoginDto, TokenResponseDto } from './dto';

// Compared against when the user doesn't exist so response time doesn't reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<TokenResponseDto> {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.isActive || !ok) {
      // Only the attempted email is recorded, never the password.
      await this.audit.record({ actorId: user?.id ?? null, action: AuditAction.LOGIN_FAILED, entityType: 'User', entityId: user?.id, metadata: { email: dto.email } });
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.audit.record({ actorId: user.id, action: AuditAction.LOGIN_SUCCESS, entityType: 'User', entityId: user.id });
    const expiresIn = this.config.getOrThrow<string>('jwt.expiresIn');
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { accessToken, tokenType: 'Bearer', expiresIn };
  }
}
