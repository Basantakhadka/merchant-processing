import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { Role } from '../users/role.enum';
import { ApplicationsService } from './applications.service';
import { AssignReviewerDto, CreateApplicationDto, DecisionDto, ListApplicationsQuery, UpdateApplicationDto } from './dto/application.dto';

const Id = () => Param('id', new ParseUUIDPipe());

@ApiTags('applications')
@ApiBearerAuth()
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly svc: ApplicationsService) {}

  @Post()
  @Roles(Role.SALES, Role.ADMIN)
  @ApiOperation({ summary: 'Create a draft application (SALES, ADMIN)' })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateApplicationDto) { return this.svc.create(u, dto); }

  @Get()
  @ApiOperation({ summary: 'List applications visible to you (SALES: own, REVIEWER: assigned, ADMIN: all). Filter + paginate.' })
  list(@CurrentUser() u: AuthUser, @Query() q: ListApplicationsQuery) { return this.svc.list(u, q); }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Get one application (404 if not visible to you)' })
  get(@CurrentUser() u: AuthUser, @Id() id: string) { return this.svc.get(u, id); }

  @Patch(':id')
  @Roles(Role.SALES, Role.ADMIN)
  @ApiOperation({ summary: 'Update while DRAFT or INFO_REQUESTED' })
  update(@CurrentUser() u: AuthUser, @Id() id: string, @Body() dto: UpdateApplicationDto) { return this.svc.update(u, id, dto); }

  @Post(':id/submit')
  @HttpCode(202)
  @Roles(Role.SALES, Role.ADMIN)
  @ApiOperation({ summary: 'Submit for review; enqueues the async risk check (returns 202 with riskStatus PENDING)' })
  submit(@CurrentUser() u: AuthUser, @Id() id: string) { return this.svc.submit(u, id); }

  @Patch(':id/assignment')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Assign a reviewer (ADMIN)' })
  assign(@CurrentUser() u: AuthUser, @Id() id: string, @Body() dto: AssignReviewerDto) { return this.svc.assign(u, id, dto); }

  @Post(':id/decision')
  @HttpCode(200)
  @Roles(Role.REVIEWER)
  @ApiOperation({ summary: 'Approve / reject / request info (assigned REVIEWER only, after risk review completes)' })
  decide(@CurrentUser() u: AuthUser, @Id() id: string, @Body() dto: DecisionDto) { return this.svc.decide(u, id, dto); }

  @Get(':id/risk-checks')
  @ApiOperation({ summary: 'Risk check history for an application' })
  riskChecks(@CurrentUser() u: AuthUser, @Id() id: string) { return this.svc.riskChecks(u, id); }

  @Post(':id/risk-review/retry')
  @HttpCode(202)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Re-queue a stuck or errored risk review (ADMIN)' })
  retryRisk(@CurrentUser() u: AuthUser, @Id() id: string) { return this.svc.retryRisk(u, id); }
}
