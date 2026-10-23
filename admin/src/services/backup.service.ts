import AdmZip from 'adm-zip';
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ZipArchive } from 'archiver';
import cassandra from 'cassandra-driver';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { adminConfig } from '../config/env.config.js';
import { adminDbPool, createBackupRecord, deleteBackupRecord, getBackupById, markBackupRestored } from './db.service.js';
import { logger } from './logger.service.js';

export type BackupComponent = 'mysql' | 'cassandra' | 'minio';

export interface CreateBackupOptions {
  components?: BackupComponent[];
  name?: string;
  notes?: string;
}

export interface RestoreBackupOptions {
  components?: BackupComponent[];
}

export interface BackupManifest {
  components: BackupComponent[];
  createdAt: string;
  id: string;
  name: string;
  notes?: string;
  stats: {
    cassandra?: {
      keyspace: string;
      rowsCount: number;
      tablesCount: number;
    };
    minio?: {
      bucket: string;
      objectsCount: number;
      totalSizeBytes: number;
    };
    mysql?: {
      database: string;
      rowsCount: number;
      tablesCount: number;
    };
  };
  version: string;
}

export interface SystemBackupStatus {
  cassandra: {
    connected: boolean;
    keyspace: string;
    tables: string[];
  };
  minio: {
    bucket: string;
    connected: boolean;
    objectsCount: number;
  };
  mysql: {
    connected: boolean;
    database: string;
    tablesCount: number;
  };
}

const s3Client = new S3Client({
  credentials: {
    accessKeyId: adminConfig.s3.accessKeyId,
    secretAccessKey: adminConfig.s3.secretAccessKey,
  },
  endpoint: adminConfig.s3.endpoint,
  forcePathStyle: adminConfig.s3.forcePathStyle,
  region: adminConfig.s3.region,
});

function getCassandraClient(): cassandra.Client {
  return new cassandra.Client({
    contactPoints: [adminConfig.cassandra.host],
    keyspace: adminConfig.cassandra.keyspace,
    localDataCenter: 'datacenter1',
    socketOptions: {
      connectTimeout: 8000,
      readTimeout: 15000,
    },
  });
}

function escapeSqlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }
  if (value instanceof Date) {
    return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
  }
  if (Buffer.isBuffer(value)) {
    return `X'${value.toString('hex')}'`;
  }
  if (typeof value === 'object') {
    const jsonStr = JSON.stringify(value);
    return `'${jsonStr.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
  }
  const str = String(value);
  return `'${str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
}

export async function getSystemStatus(): Promise<SystemBackupStatus> {
  const status: SystemBackupStatus = {
    cassandra: {
      connected: false,
      keyspace: adminConfig.cassandra.keyspace,
      tables: [],
    },
    minio: {
      bucket: adminConfig.s3.bucket,
      connected: false,
      objectsCount: 0,
    },
    mysql: {
      connected: false,
      database: adminConfig.db.name,
      tablesCount: 0,
    },
  };

  try {
    const [rows] = await adminDbPool.query<any[]>('SHOW TABLES');
    status.mysql.connected = true;
    status.mysql.tablesCount = rows.length;
  } catch (err) {
    logger.db.warn('No se pudo verificar estado de MySQL para copias de seguridad', err);
  }

  const cassClient = getCassandraClient();
  try {
    await cassClient.connect();
    const result = await cassClient.execute(
      'SELECT table_name FROM system_schema.tables WHERE keyspace_name = ?',
      [adminConfig.cassandra.keyspace]
    );
    status.cassandra.connected = true;
    status.cassandra.tables = result.rows.map((r) => String(r.table_name));
  } catch (err) {
    logger.db.warn('No se pudo verificar estado de Cassandra para copias de seguridad', err);
  } finally {
    await cassClient.shutdown().catch(() => {});
  }

  try {
    const objects = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: adminConfig.s3.bucket,
      })
    );
    status.minio.connected = true;
    status.minio.objectsCount = (objects.Contents || []).filter(
      (o) => !o.Key?.startsWith('backups/')
    ).length;
  } catch (err) {
    logger.db.warn('No se pudo verificar estado de MinIO para copias de seguridad', err);
  }

  return status;
}

export async function dumpMySql(): Promise<{ rowsCount: number; sql: string; tablesCount: number }> {
  const [tablesResult] = await adminDbPool.query<any[]>('SHOW TABLES');
  const tableKey = Object.keys(tablesResult[0] || {})[0];
  const tables = tablesResult.map((r) => r[tableKey] as string);

  let totalRows = 0;
  const sqlChunks: string[] = [
    'SET FOREIGN_KEY_CHECKS=0;\n',
    'SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";\n',
  ];

  for (const table of tables) {
    if (table === 'backup_records') {
      continue;
    }

    const [createResult] = await adminDbPool.query<any[]>(`SHOW CREATE TABLE \`${table}\``);
    const createSql = createResult[0]['Create Table'] as string;

    sqlChunks.push(`DROP TABLE IF EXISTS \`${table}\`;\n`);
    sqlChunks.push(`${createSql};\n\n`);

    const [rows] = await adminDbPool.query<any[]>(`SELECT * FROM \`${table}\``);
    if (rows.length > 0) {
      totalRows += rows.length;
      const columns = Object.keys(rows[0]);
      const escapedCols = columns.map((c) => `\`${c}\``).join(', ');

      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const valuesList = batch
          .map((row) => `(${columns.map((col) => escapeSqlValue(row[col])).join(', ')})`)
          .join(',\n');
        sqlChunks.push(`INSERT INTO \`${table}\` (${escapedCols}) VALUES\n${valuesList};\n\n`);
      }
    }
  }

  sqlChunks.push('SET FOREIGN_KEY_CHECKS=1;\n');

  return {
    rowsCount: totalRows,
    sql: sqlChunks.join(''),
    tablesCount: tables.length,
  };
}

export async function dumpCassandra(): Promise<{
  rowsCount: number;
  tables: Record<string, { columns: string[]; rows: any[] }>;
  tablesCount: number;
}> {
  const client = getCassandraClient();
  await client.connect();

  const tablesMap: Record<string, { columns: string[]; rows: any[] }> = {};
  let totalRows = 0;

  try {
    const tablesQuery = await client.execute(
      'SELECT table_name FROM system_schema.tables WHERE keyspace_name = ?',
      [adminConfig.cassandra.keyspace]
    );

    for (const row of tablesQuery.rows) {
      const tableName = String(row.table_name);
      const colsQuery = await client.execute(
        'SELECT column_name FROM system_schema.columns WHERE keyspace_name = ? AND table_name = ?',
        [adminConfig.cassandra.keyspace, tableName]
      );
      const columns = colsQuery.rows.map((c) => String(c.column_name));

      const rowsResult = await client.execute(
        `SELECT * FROM ${adminConfig.cassandra.keyspace}.${tableName}`
      );

      const serializedRows = rowsResult.rows.map((r) => {
        const item: Record<string, any> = {};
        for (const col of columns) {
          const val = r[col];
          if (val === null || val === undefined) {
            item[col] = null;
          } else if (typeof val.toString === 'function' && typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') {
            item[col] = val.toString();
          } else {
            item[col] = val;
          }
        }
        return item;
      });

      totalRows += serializedRows.length;
      tablesMap[tableName] = {
        columns,
        rows: serializedRows,
      };
    }

    return {
      rowsCount: totalRows,
      tables: tablesMap,
      tablesCount: Object.keys(tablesMap).length,
    };
  } finally {
    await client.shutdown().catch(() => {});
  }
}

export async function dumpMinio(): Promise<{
  objects: Array<{ body: Buffer; contentType?: string; key: string }>;
  objectsCount: number;
  totalSizeBytes: number;
}> {
  const objects: Array<{ body: Buffer; contentType?: string; key: string }> = [];
  let continuationToken: string | undefined;
  let totalBytes = 0;

  do {
    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: adminConfig.s3.bucket,
        ContinuationToken: continuationToken,
      })
    );

    const contents = listResponse.Contents || [];
    for (const item of contents) {
      if (!item.Key || item.Key.startsWith('backups/')) {
        continue;
      }

      const getResponse = await s3Client.send(
        new GetObjectCommand({
          Bucket: adminConfig.s3.bucket,
          Key: item.Key,
        })
      );

      if (getResponse.Body) {
        const chunks: Uint8Array[] = [];
        for await (const chunk of getResponse.Body as any) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        totalBytes += buffer.length;
        objects.push({
          body: buffer,
          contentType: getResponse.ContentType,
          key: item.Key,
        });
      }
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  return {
    objects,
    objectsCount: objects.length,
    totalSizeBytes: totalBytes,
  };
}

export async function createBackup(options: CreateBackupOptions = {}) {
  const backupId = crypto.randomUUID();
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `aurora-backup-${dateStr}-${backupId.slice(0, 8)}.zip`;
  const s3Key = `backups/${filename}`;

  const selectedComponents = options.components && options.components.length > 0
    ? options.components
    : (['mysql', 'cassandra', 'minio'] as BackupComponent[]);

  const backupName = options.name?.trim() || `Copia de Seguridad ${new Date().toLocaleString('es-MX')}`;
  const notes = options.notes?.trim() || null;

  const manifest: BackupManifest = {
    components: selectedComponents,
    createdAt: new Date().toISOString(),
    id: backupId,
    name: backupName,
    notes: notes || undefined,
    stats: {},
    version: '1.0',
  };

  const archive = new ZipArchive({ zlib: { level: 9 } });
  const chunks: Buffer[] = [];

  archive.on('data', (chunk: Buffer) => chunks.push(chunk));

  const archivePromise = new Promise<Buffer>((resolve, reject) => {
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', (err: unknown) => reject(err));
  });

  if (selectedComponents.includes('mysql')) {
    const mysqlData = await dumpMySql();
    archive.append(mysqlData.sql, { name: 'mysql/database.sql' });
    manifest.stats.mysql = {
      database: adminConfig.db.name,
      rowsCount: mysqlData.rowsCount,
      tablesCount: mysqlData.tablesCount,
    };
  }

  if (selectedComponents.includes('cassandra')) {
    const cassData = await dumpCassandra();
    archive.append(JSON.stringify(cassData.tables, null, 2), { name: 'cassandra/tables.json' });
    manifest.stats.cassandra = {
      keyspace: adminConfig.cassandra.keyspace,
      rowsCount: cassData.rowsCount,
      tablesCount: cassData.tablesCount,
    };
  }

  if (selectedComponents.includes('minio')) {
    const minioData = await dumpMinio();
    const minioManifest: Array<{ contentType?: string; key: string }> = [];

    for (let i = 0; i < minioData.objects.length; i++) {
      const obj = minioData.objects[i];
      const entryName = `minio/data/object_${i}_${encodeURIComponent(obj.key)}`;
      archive.append(obj.body, { name: entryName });
      minioManifest.push({
        contentType: obj.contentType,
        key: obj.key,
      });
    }

    archive.append(JSON.stringify(minioManifest, null, 2), { name: 'minio/manifest.json' });
    manifest.stats.minio = {
      bucket: adminConfig.s3.bucket,
      objectsCount: minioData.objectsCount,
      totalSizeBytes: minioData.totalSizeBytes,
    };
  }

  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
  await archive.finalize();

  const zipBuffer = await archivePromise;
  const checksum = crypto.createHash('sha256').update(zipBuffer).digest('hex');

  await s3Client.send(
    new PutObjectCommand({
      Body: zipBuffer,
      Bucket: adminConfig.s3.bucket,
      ContentType: 'application/zip',
      Key: s3Key,
    })
  );

  await createBackupRecord({
    checksum_sha256: checksum,
    components: selectedComponents,
    filename,
    id: backupId,
    metadata: manifest.stats as any,
    name: backupName,
    notes,
    s3_bucket: adminConfig.s3.bucket,
    s3_key: s3Key,
    size_bytes: zipBuffer.length,
    status: 'completed',
  });

  logger.security.info('Copia de seguridad del sistema generada exitosamente', {
    backupId,
    components: selectedComponents,
    filename,
    sizeBytes: zipBuffer.length,
  });

  return await getBackupById(backupId);
}

export async function restoreBackup(backupId: string, options: RestoreBackupOptions = {}) {
  const backup = await getBackupById(backupId);
  if (!backup) {
    throw new Error('Respaldo no encontrado.');
  }

  const s3Response = await s3Client.send(
    new GetObjectCommand({
      Bucket: backup.s3_bucket,
      Key: backup.s3_key,
    })
  );

  const chunks: Uint8Array[] = [];
  for await (const chunk of s3Response.Body as any) {
    chunks.push(chunk);
  }
  const zipBuffer = Buffer.concat(chunks);

  const zip = new AdmZip(zipBuffer);
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) {
    throw new Error('Archivo de respaldo inválido o corrupto: falta manifest.json.');
  }

  const manifest = JSON.parse(manifestEntry.getData().toString('utf8')) as BackupManifest;

  const componentsToRestore = options.components && options.components.length > 0
    ? options.components.filter((c) => manifest.components.includes(c))
    : manifest.components;

  const restoredSummary: {
    cassandra?: boolean;
    minio?: boolean;
    mysql?: boolean;
  } = {};

  if (componentsToRestore.includes('mysql')) {
    const sqlEntry = zip.getEntry('mysql/database.sql');
    if (sqlEntry) {
      const sqlContent = sqlEntry.getData().toString('utf8');
      const connection = await adminDbPool.getConnection();
      try {
        await connection.query('SET FOREIGN_KEY_CHECKS=0');
        const statements = sqlContent
          .split(/;\s*[\r\n]+/)
          .map((stmt) => stmt.trim())
          .filter((stmt) => stmt.length > 0 && !stmt.startsWith('--'));

        for (const statement of statements) {
          if (statement.includes('`backup_records`') || statement.includes('backup_records')) {
            continue;
          }
          await connection.query(statement);
        }
        await connection.query('SET FOREIGN_KEY_CHECKS=1');
        restoredSummary.mysql = true;
      } finally {
        connection.release();
      }
    }
  }

  if (componentsToRestore.includes('cassandra')) {
    const cassEntry = zip.getEntry('cassandra/tables.json');
    if (cassEntry) {
      const tablesMap = JSON.parse(cassEntry.getData().toString('utf8')) as Record<
        string,
        { columns: string[]; rows: any[] }
      >;
      const cassClient = getCassandraClient();
      await cassClient.connect();

      try {
        for (const [tableName, tableData] of Object.entries(tablesMap)) {
          await cassClient.execute(`TRUNCATE TABLE ${adminConfig.cassandra.keyspace}.${tableName}`);

          for (const row of tableData.rows) {
            const columns = Object.keys(row).filter((k) => row[k] !== null && row[k] !== undefined);
            if (columns.length === 0) continue;

            const placeholders = columns.map(() => '?').join(', ');
            const query = `INSERT INTO ${adminConfig.cassandra.keyspace}.${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
            const params = columns.map((col) => row[col]);

            await cassClient.execute(query, params, { prepare: true });
          }
        }
        restoredSummary.cassandra = true;
      } finally {
        await cassClient.shutdown().catch(() => {});
      }
    }
  }

  if (componentsToRestore.includes('minio')) {
    const minioManifestEntry = zip.getEntry('minio/manifest.json');
    if (minioManifestEntry) {
      const minioManifest = JSON.parse(minioManifestEntry.getData().toString('utf8')) as Array<{
        contentType?: string;
        key: string;
      }>;

      for (let i = 0; i < minioManifest.length; i++) {
        const item = minioManifest[i];
        const entryName = `minio/data/object_${i}_${encodeURIComponent(item.key)}`;
        const fileEntry = zip.getEntry(entryName);
        if (fileEntry) {
          const fileData = fileEntry.getData();
          await s3Client.send(
            new PutObjectCommand({
              Body: fileData,
              Bucket: adminConfig.s3.bucket,
              ContentType: item.contentType || 'application/octet-stream',
              Key: item.key,
            })
          );
        }
      }
      restoredSummary.minio = true;
    }
  }

  await markBackupRestored(backupId);

  logger.security.info('Restauración de copia de seguridad ejecutada con éxito', {
    backupId,
    components: componentsToRestore,
    restoredSummary,
  });

  return {
    backupId,
    components: componentsToRestore,
    restoredSummary,
    success: true,
  };
}

export async function deleteBackup(backupId: string): Promise<boolean> {
  const backup = await getBackupById(backupId);
  if (!backup) {
    return false;
  }

  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: backup.s3_bucket,
        Key: backup.s3_key,
      })
    );
  } catch (err) {
    logger.db.warn('No se pudo eliminar archivo físico de respaldo en S3', err);
  }

  const deleted = await deleteBackupRecord(backupId);

  logger.security.info('Copia de seguridad eliminada', {
    backupId,
    filename: backup.filename,
  });

  return deleted;
}

export async function getBackupDownloadStream(backupId: string) {
  const backup = await getBackupById(backupId);
  if (!backup) {
    return null;
  }

  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: backup.s3_bucket,
      Key: backup.s3_key,
    })
  );

  return {
    backup,
    contentLength: backup.size_bytes,
    contentType: response.ContentType || 'application/zip',
    filename: backup.filename,
    stream: response.Body,
  };
}
