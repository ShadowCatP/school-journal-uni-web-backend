import mysql, { type Pool } from "mysql2/promise";

import config from "../config/config";

let pool: Pool | null = null;

export function getDbPool(): Pool | null {
  if (!config.db) return null;

  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      port: config.db.port,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  return pool;
}
