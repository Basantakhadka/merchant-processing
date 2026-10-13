import 'reflect-metadata';
import { config } from 'dotenv';
import * as bcrypt from 'bcryptjs';
import dataSource from './data-source';
import { User } from '../users/user.entity';
import { Role } from '../users/role.enum';

config({ quiet: true });

const need = (n: string) => { const v = process.env[n]; if (!v) throw new Error(`${n} is required to seed`); return v; };

/** Idempotent dev seed. Passwords come from the environment — nothing secret lives in the repo. */
export async function seed() {
  const ds = dataSource.isInitialized ? dataSource : await dataSource.initialize();
  const repo = ds.getRepository(User);
  const users: Array<[string, string, Role, string]> = [
    ['admin@example.test', 'Ada Admin', Role.ADMIN, need('SEED_ADMIN_PASSWORD')],
    ['reviewer1@example.test', 'Rita Reviewer', Role.REVIEWER, need('SEED_REVIEWER_PASSWORD')],
    ['reviewer2@example.test', 'Ravi Reviewer', Role.REVIEWER, need('SEED_REVIEWER_PASSWORD')],
    ['sales1@example.test', 'Sam Sales', Role.SALES, need('SEED_SALES_PASSWORD')],
    ['sales2@example.test', 'Sara Sales', Role.SALES, need('SEED_SALES_PASSWORD')],
  ];
  for (const [email, name, role, password] of users) {
    if (await repo.findOne({ where: { email } })) continue;
    await repo.insert({ email, name, role, passwordHash: await bcrypt.hash(password, 10) });
    console.log(`seeded ${role}: ${email}`);
  }
  if (require.main === module) await ds.destroy();
}

if (require.main === module) seed().catch((e) => { console.error(e); process.exit(1); });
