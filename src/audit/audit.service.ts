import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { redact } from '../common/utils/redact';
import { AuditAction, AuditLog } from './audit-log.entity';

export interface AuditEntry {
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  /** Pass `manager` to write the audit row in the same transaction as the change it describes. */
  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(AuditLog) : this.repo;
    await repo.insert({
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: redact(entry.metadata ?? {}) as QueryDeepPartialEntity<Record<string, unknown>>,
    });
  }

  async list(q: { entityType?: string; entityId?: string; actorId?: string; action?: AuditAction; page: number; limit: number }) {
    const qb = this.repo.createQueryBuilder('a').orderBy('a.createdAt', 'DESC').skip((q.page - 1) * q.limit).take(q.limit);
    if (q.entityType) qb.andWhere('a.entityType = :t', { t: q.entityType });
    if (q.entityId) qb.andWhere('a.entityId = :e', { e: q.entityId });
    if (q.actorId) qb.andWhere('a.actorId = :a', { a: q.actorId });
    if (q.action) qb.andWhere('a.action = :ac', { ac: q.action });
    const [items, total] = await qb.getManyAndCount();
    return { items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } };
  }
}
