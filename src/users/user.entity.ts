import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from './role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ type: 'varchar', length: 255 }) email: string;
  @Column({ type: 'varchar', length: 120 }) name: string;
  @Column({ name: 'password_hash', type: 'varchar', length: 100, select: false }) passwordHash: string;
  @Column({ type: 'enum', enum: Role, enumName: 'user_role' }) role: Role;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
