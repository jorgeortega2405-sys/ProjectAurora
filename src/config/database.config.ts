import { logger } from '../services/logger.service.js';
import { config } from './env.config.js';
import mysql from 'mysql2/promise';

const defaultDbOptions: mysql.PoolOptions = {
  connectionLimit: 20,
  database: config.db.name,
  enableKeepAlive: true,
  host: config.db.host,
  keepAliveInitialDelay: 10000,
  password: config.db.password,
  port: config.db.port,
  queueLimit: 100,
  user: config.db.user,
  waitForConnections: true,
};

export const pool = mysql.createPool(defaultDbOptions);

export async function checkDbConnection(retries = 15, delayMs = 1500): Promise<boolean> {
  for (let i = 1; i <= retries; i++) {
    let conn: mysql.PoolConnection | null = null;
    try {
      conn = await pool.getConnection();
      await conn.ping();
      logger.db.info('Conexión establecida exitosamente con MySQL (db_aurora).');
      return true;
    } catch (err) {
      logger.db.warn(`Esperando a MySQL en ${config.db.host}:${config.db.port} (intento ${i}/${retries})...`);
      if (i === retries) {
        logger.db.error('No se pudo conectar a la base de datos MySQL después de múltiples intentos.', err);
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }
  return false;
}

export async function closeDbPools(): Promise<void> {
  try {
    await pool.end();
    logger.db.info('Pool de conexiones MySQL cerrado correctamente.');
  } catch (err) {
    logger.db.error('Error al cerrar pool de conexiones MySQL', err);
  }
}

export default pool;
