import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifySignature } from './webhook-signature';

/** Runs before the ValidationPipe, so unsigned requests are rejected (401) before their body is even parsed. */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const ok = verifySignature(
      this.config.getOrThrow<string>('payments.webhookSecret'),
      req.headers['x-webhook-timestamp'], req.headers['x-webhook-signature'], req.rawBody,
    );
    if (!ok) throw new UnauthorizedException('Invalid webhook signature');
    return true;
  }
}
