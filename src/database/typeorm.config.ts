import { DataSourceOptions } from 'typeorm';
import { join } from 'path';

export function buildTypeOrmOptions(db: { host: string; port: number; user: string; password: string; name: string }): DataSourceOptions {
  return {
    type: 'postgres',
    host: db.host, port: db.port, username: db.user, password: db.password, database: db.name,
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    synchronize: false, // schema is owned by reviewed migrations only
    migrationsRun: false,
  };
}
