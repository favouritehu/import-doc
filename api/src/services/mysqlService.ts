// Phase-B MySQL access. Phase A ships the interface only; the pool is created
// once `mysql2/promise` is added and MYSQL_* env vars are set.

export interface MysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function mysqlConfig(): MysqlConfig {
  return {
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE ?? 'import_desk',
  };
}

export function isConfigured(): boolean {
  return Boolean(process.env.MYSQL_DATABASE && process.env.MYSQL_USER);
}

// Phase B:
//   import mysql from 'mysql2/promise';
//   let pool: mysql.Pool | null = null;
//   export function getPool() { return (pool ??= mysql.createPool({ ...mysqlConfig(), charset: 'utf8mb4' })); }
export function getPool(): never {
  throw new Error('mysqlService: pool not wired in Phase A — add mysql2/promise in Phase B');
}
