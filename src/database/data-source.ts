import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildTypeOrmOptions } from './typeorm.config';

config({ quiet: true });
const isTest = process.env.NODE_ENV === 'test';
export default new DataSource(buildTypeOrmOptions({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  user: process.env.DB_USER ?? '',
  password: process.env.DB_PASSWORD ?? '',
  name: (isTest ? process.env.DB_TEST_NAME : process.env.DB_NAME) ?? '',
}));
