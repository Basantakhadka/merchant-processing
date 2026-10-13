import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantApplication } from '../applications/application.entity';
import { PaymentProviderService } from './payment-provider.service';
import { Payment, PaymentWebhookEvent } from './payment.entity';
import { ApplicationPaymentsController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WebhookSignatureGuard } from './webhook-signature.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, PaymentWebhookEvent, MerchantApplication])],
  controllers: [ApplicationPaymentsController, PaymentsController],
  providers: [PaymentsService, PaymentProviderService, WebhookSignatureGuard],
})
export class PaymentsModule {}
