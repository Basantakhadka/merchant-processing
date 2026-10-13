import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantApplication } from '../applications/application.entity';
import { RISK_QUEUE } from './risk.constants';
import { RiskCheck } from './risk-check.entity';
import { RiskProcessor } from './risk.processor';
import { RiskProviderService } from './risk-provider.service';
import { RiskQueueService } from './risk-queue.service';

@Module({
  imports: [BullModule.registerQueue({ name: RISK_QUEUE }), TypeOrmModule.forFeature([RiskCheck, MerchantApplication])],
  providers: [RiskProcessor, RiskProviderService, RiskQueueService],
  exports: [RiskQueueService, TypeOrmModule],
})
export class RiskModule {}
