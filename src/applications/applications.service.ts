import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditAction } from '../audit/audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { RiskCheck, RiskCheckStatus } from '../risk/risk-check.entity';
import { RiskQueueService } from '../risk/risk-queue.service';
import { Role } from '../users/role.enum';
import { UsersService } from '../users/users.service';
import { MerchantApplication } from './application.entity';
import { toResponse } from './application.mapper';
import { ApplicationPolicy } from './application.policy';
import { assertDecisionAllowed, assertTransition, DECISION_TARGET, isEditable, TERMINAL_STATUSES } from './application-state';
import { AssignReviewerDto, CreateApplicationDto, DecisionDto, ListApplicationsQuery, UpdateApplicationDto } from './dto/application.dto';
import { ApplicationStatus, ReviewDecision, RiskStatus } from './enums';

const ENTITY = 'MerchantApplication';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(MerchantApplication) private readonly repo: Repository<MerchantApplication>,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly queue: RiskQueueService,
  ) {}

  async create(user: AuthUser, dto: CreateApplicationDto) {
    // Only ADMIN/SALES reach here (controller @Roles); createdById always comes from the token, never the body.
    const saved = await this.ds.transaction(async (m) => {
      const app = await m.save(m.create(MerchantApplication, { ...dto, ownerNationalId: dto.ownerNationalId ?? null, createdById: user.id }));
      await this.audit.record({ actorId: user.id, action: AuditAction.APPLICATION_CREATED, entityType: ENTITY, entityId: app.id,
        metadata: { businessName: app.businessName, status: app.status } }, m);
      return app;
    });
    return toResponse(saved);
  }

  async list(user: AuthUser, q: ListApplicationsQuery) {
    const qb = this.repo.createQueryBuilder('a').orderBy('a.createdAt', 'DESC').addOrderBy('a.id', 'ASC')
      .skip((q.page - 1) * q.limit).take(q.limit);
    // Object-level scoping is applied in the query itself, so other users' rows are never loaded.
    if (user.role === Role.SALES) qb.andWhere('a.createdById = :uid', { uid: user.id });
    else if (user.role === Role.REVIEWER) qb.andWhere('a.assignedReviewerId = :uid', { uid: user.id });
    if (q.status) qb.andWhere('a.status = :status', { status: q.status });
    if (q.riskStatus) qb.andWhere('a.riskStatus = :rs', { rs: q.riskStatus });
    const [items, total] = await qb.getManyAndCount();
    return { items: items.map(toResponse), meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } };
  }

  async get(user: AuthUser, id: string) {
    return toResponse(await this.getVisible(user, id));
  }

  async update(user: AuthUser, id: string, dto: UpdateApplicationDto) {
    const updated = await this.ds.transaction(async (m) => {
      const app = await this.lockVisible(m, user, id);
      if (!ApplicationPolicy.canEdit(user, app)) throw new ForbiddenException('You may not edit this application');
      if (!isEditable(app.status)) throw new ConflictException(`Application is not editable in status ${app.status}`);
      const changed = Object.keys(dto).filter((k) => (dto as Record<string, unknown>)[k] !== undefined);
      Object.assign(app, dto);
      const saved = await m.save(app);
      await this.audit.record({ actorId: user.id, action: AuditAction.APPLICATION_UPDATED, entityType: ENTITY, entityId: id,
        metadata: { changedFields: changed } }, m); // field names only, never values
      return saved;
    });
    return toResponse(updated);
  }

  /** DRAFT / INFO_REQUESTED -> SUBMITTED, then enqueue the async risk review. */
  async submit(user: AuthUser, id: string) {
    const { app, submissionNo } = await this.ds.transaction(async (m) => {
      const a = await this.lockVisible(m, user, id);
      if (!ApplicationPolicy.canSubmit(user, a)) throw new ForbiddenException('You may not submit this application');
      assertTransition(a.status, ApplicationStatus.SUBMITTED);
      a.status = ApplicationStatus.SUBMITTED;
      a.riskStatus = RiskStatus.PENDING;
      a.riskScore = null;
      a.decisionNotes = null;
      a.submissionCount += 1;
      a.submittedAt = new Date();
      const saved = await m.save(a);
      await m.insert(RiskCheck, { applicationId: id, submissionNo: saved.submissionCount });
      await this.audit.record({ actorId: user.id, action: AuditAction.APPLICATION_SUBMITTED, entityType: ENTITY, entityId: id,
        metadata: { submissionNo: saved.submissionCount } }, m);
      return { app: saved, submissionNo: saved.submissionCount };
    });
    // After commit so the worker never sees uncommitted data. If Redis is down here the app stays
    // PENDING and an ADMIN can re-queue via POST /applications/:id/risk-review/retry.
    await this.queue.enqueue(id, submissionNo);
    return toResponse(app);
  }

  async assign(user: AuthUser, id: string, dto: AssignReviewerDto) {
    const reviewer = await this.users.findActiveReviewer(dto.reviewerId);
    if (!reviewer) throw new NotFoundException('Active reviewer not found');
    const updated = await this.ds.transaction(async (m) => {
      const app = await this.lockVisible(m, user, id);
      if (TERMINAL_STATUSES.includes(app.status)) throw new ConflictException(`Cannot assign a ${app.status} application`);
      const previous = app.assignedReviewerId;
      app.assignedReviewerId = reviewer.id;
      const saved = await m.save(app);
      await this.audit.record({ actorId: user.id, action: AuditAction.APPLICATION_ASSIGNED, entityType: ENTITY, entityId: id,
        metadata: { reviewerId: reviewer.id, previousReviewerId: previous } }, m);
      return saved;
    });
    return toResponse(updated);
  }

  async decide(user: AuthUser, id: string, dto: DecisionDto) {
    const updated = await this.ds.transaction(async (m) => {
      const app = await this.lockVisible(m, user, id);
      if (!ApplicationPolicy.canDecide(user, app)) throw new ForbiddenException('Only the assigned reviewer may record a decision');
      assertDecisionAllowed(app.status, app.riskStatus, dto.decision);
      const from = app.status;
      app.status = DECISION_TARGET[dto.decision];
      app.decisionNotes = dto.notes ?? null;
      app.decidedAt = dto.decision === ReviewDecision.REQUEST_INFO ? null : new Date();
      const saved = await m.save(app);
      await this.audit.record({ actorId: user.id, action: AuditAction.REVIEW_DECISION, entityType: ENTITY, entityId: id,
        metadata: { decision: dto.decision, from, to: saved.status, riskStatus: saved.riskStatus, hasNotes: !!dto.notes } }, m);
      return saved;
    });
    return toResponse(updated);
  }

  /** ADMIN: re-queue a risk review that is stuck PENDING (e.g. Redis outage) or ended in ERROR. */
  async retryRisk(user: AuthUser, id: string) {
    const { app, runs, submissionNo } = await this.ds.transaction(async (m) => {
      const a = await this.lockVisible(m, user, id);
      if (a.status !== ApplicationStatus.SUBMITTED || ![RiskStatus.ERROR, RiskStatus.PENDING].includes(a.riskStatus)) {
        throw new ConflictException('Risk review can only be retried for SUBMITTED applications with risk status PENDING or ERROR');
      }
      const check = await m.findOneOrFail(RiskCheck, { where: { applicationId: id, submissionNo: a.submissionCount }, lock: { mode: 'pessimistic_write' } });
      if (check.status === RiskCheckStatus.COMPLETED) throw new ConflictException('Risk review already completed');
      await m.update(RiskCheck, check.id, { status: RiskCheckStatus.PENDING, runs: check.runs + 1, lastError: null });
      a.riskStatus = RiskStatus.PENDING;
      return { app: await m.save(a), runs: check.runs + 1, submissionNo: a.submissionCount };
    });
    await this.queue.enqueue(id, submissionNo, runs);
    return toResponse(app);
  }

  async riskChecks(user: AuthUser, id: string) {
    await this.getVisible(user, id);
    return this.ds.getRepository(RiskCheck).find({ where: { applicationId: id }, order: { submissionNo: 'DESC' } });
  }

  // ---- helpers ----

  /** 404 (not 403) when the caller may not see the row, so ids of other users' applications can't be probed. */
  private async getVisible(user: AuthUser, id: string): Promise<MerchantApplication> {
    const app = await this.repo.findOne({ where: { id } });
    if (!app || !ApplicationPolicy.canView(user, app)) throw new NotFoundException('Application not found');
    return app;
  }

  private async lockVisible(m: EntityManager, user: AuthUser, id: string): Promise<MerchantApplication> {
    const app = await m.getRepository(MerchantApplication).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!app || !ApplicationPolicy.canView(user, app)) throw new NotFoundException('Application not found');
    return app;
  }
}
