import 'dotenv/config';

export const adminConfig = {
  appName: process.env.ADMIN_APP_NAME || 'ProjectAurora Admin',
  baseUrl: process.env.ADMIN_BASE_URL || 'http://localhost:3005',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    name: process.env.DB_NAME || 'db_aurora',
    password: process.env.DB_PASSWORD || 'aurora_password',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'aurora_user',
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.ADMIN_PORT || '3005', 10),
  vitePort: parseInt(process.env.ADMIN_VITE_PORT || '5175', 10),
};
