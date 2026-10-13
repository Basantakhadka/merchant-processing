import { Body, Controller, Get, Headers, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { Role } from '../users/role.enum';
import { CreatePaymentDto, SimulateCallbackDto, WebhookEventDto } from './dto';
import { PaymentsService } from './payments.service';
import { WebhookSignatureGuard } from './webhook-signature.guard';

const Id = () => Param('id', new ParseUUIDPipe());

@ApiTags('payments')
@ApiBearerAuth()
@Controller('applications/:id/payments')
export class ApplicationPaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Post()
  @Roles(Role.SALES, Role.ADMIN)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: '8-64 chars. Same key + same body returns the same payment (200); a new key creates a new payment (201).' })
  @ApiOperation({ summary: 'Create a PENDING payment for an APPROVED application (SALES own / ADMIN)' })
  async create(@CurrentUser() u: AuthUser, @Id() id: string, @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') key: string | undefined, @Res({ passthrough: true }) res: Response) {
    const { payment, created } = await this.svc.create(u, id, dto, key);
    res.status(created ? 201 : 200);
    return payment;
  }

  @Get()
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Payments of an application (404 if the application is not visible to you)' })
  list(@CurrentUser() u: AuthUser, @Id() id: string) { return this.svc.listForApplication(u, id); }
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Public()
  @UseGuards(WebhookSignatureGuard)
  @Post('webhook')
  @HttpCode(200)
  @ApiHeader({ name: 'X-Webhook-Timestamp', required: true, description: 'Unix seconds; must be within 5 minutes' })
  @ApiHeader({ name: 'X-Webhook-Signature', required: true, description: 'hex HMAC-SHA256 of "<timestamp>.<raw body>" with PAYMENT_WEBHOOK_SECRET' })
  @ApiOperation({ summary: 'Provider callback (signed, idempotent on eventId). Use the simulate endpoint to try it from Swagger.' })
  async webhook(@Body() dto: WebhookEventDto) {
    const { result } = await this.svc.handleWebhook(dto);
    return { received: true, result };
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Get one payment (404 if its application is not visible to you)' })
  get(@CurrentUser() u: AuthUser, @Id() id: string) { return this.svc.get(u, id); }

  @Post(':id/simulate-callback')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'DEV ONLY (ADMIN): act as the provider and deliver the outcome for a payment. Disabled in production.' })
  async simulate(@CurrentUser() u: AuthUser, @Id() id: string, @Body() dto: SimulateCallbackDto) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    const payment = await this.svc.get(u, id);
    const out = await this.svc.handleWebhook({ eventId: `sim_${randomUUID()}`, providerReference: payment.providerReference, status: dto.status, failureReason: dto.failureReason });
    return { ...out, payment: await this.svc.get(u, id) };
  }
}
