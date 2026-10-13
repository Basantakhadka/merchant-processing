import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { Role } from './role.enum';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  findById(id: string) { return this.repo.findOne({ where: { id } }); }

  findByEmailWithPassword(email: string) {
    return this.repo.createQueryBuilder('u').addSelect('u.passwordHash').where('u.email = :email', { email: email.toLowerCase() }).getOne();
  }

  findActiveReviewer(id: string) {
    return this.repo.findOne({ where: { id, role: Role.REVIEWER, isActive: true } });
  }

  listReviewers() { return this.repo.find({ where: { role: Role.REVIEWER, isActive: true }, order: { name: 'ASC' } }); }
}
