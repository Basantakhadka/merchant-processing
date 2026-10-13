import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { Role } from './role.enum';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('reviewers')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List active reviewers (ADMIN) — use an id from here to assign an application' })
  async reviewers() {
    return (await this.users.listReviewers()).map((u) => ({ id: u.id, name: u.name, email: u.email }));
  }
}
