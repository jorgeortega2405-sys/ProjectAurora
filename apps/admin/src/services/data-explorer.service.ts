import cassandra from 'cassandra-driver';
import { adminConfig } from '../config/env.config.js';
import { adminDbPool } from './db.service.js';
import { logger } from './logger.service.js';
import { SecurityAuditService } from './security-audit.service.js';
import { ColumnSchemaInfo, DatabaseEngine, DatabaseSchemaInfo, QueryExecutionResult, QueryTemplate, SchemaDiscoveryResponse, TableSchemaInfo } from '../types/data-explorer.types.js';

let cassandraClientInstance: cassandra.Client | null = null;

function getCassandraClient(): cassandra.Client {
  if (!cassandraClientInstance) {
    cassandraClientInstance = new cassandra.Client({
      contactPoints: [adminConfig.cassandra.host],
      keyspace: adminConfig.cassandra.keyspace,
      localDataCenter: 'datacenter1',
    });
  }
  return cassandraClientInstance;
}

function isSensitiveColumn(columnName: string): boolean {
  const lower = columnName.toLowerCase();
  return (
    lower.includes('password') ||
    lower.includes('secret') ||
    lower.includes('token') ||
    lower.includes('backup_code') ||
    lower.includes('two_factor') ||
    lower === 'checksum' ||
    lower === 'api_key'
  );
}

function serializeCassandraValue(val: unknown): unknown {
  if (val === null || val === undefined) {
    return null;
  }
  if (typeof val === 'bigint') {
    return val.toString();
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (Buffer.isBuffer(val)) {
    return `0x${val.toString('hex')}`;
  }
  if (typeof val === 'object') {
    const objVal = val as Record<string, unknown>;
    const ctorName = val.constructor ? val.constructor.name : '';
    if (
      ctorName === 'TimeUuid' ||
      ctorName === 'Uuid' ||
      ctorName === 'Long' ||
      ctorName === 'InetAddress' ||
      ctorName === 'LocalDate' ||
      ctorName === 'LocalTime'
    ) {
      return typeof objVal.toString === 'function' ? objVal.toString() : String(val);
    }
    if (Array.isArray(val)) {
      return val.map(serializeCassandraValue);
    }
    if (val instanceof Set) {
      return Array.from(val).map(serializeCassandraValue);
    }
    if (val instanceof Map) {
      const result: Record<string, unknown> = {};
      for (const [k, v] of val.entries()) {
        result[String(k)] = serializeCassandraValue(v);
      }
      return result;
    }
  }
  return val;
}

export class DataExplorerService {
  static async getSchemaDiscovery(): Promise<SchemaDiscoveryResponse> {
    try {
      const mysqlSchema = await this.getMysqlSchema();
      const cassandraSchema = await this.getCassandraSchema();
      return {
        cassandra: cassandraSchema,
        mysql: mysqlSchema,
      };
    } catch (err) {
      logger.db.error('Error al descubrir esquemas de bases de datos', {
        error: (err as Error).message,
      });
      throw new Error('No fue posible obtener el esquema de las bases de datos.');
    }
  }

  private static async getMysqlSchema(): Promise<DatabaseSchemaInfo> {
    const dbName = adminConfig.db.name;
    const [tablesRows] = await adminDbPool.query<any[]>(
      `SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, TABLE_COMMENT 
       FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = ? 
       ORDER BY TABLE_NAME ASC`,
      [dbName]
    );

    const [columnsRows] = await adminDbPool.query<any[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA, COLUMN_COMMENT 
       FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = ? 
       ORDER BY TABLE_NAME ASC, ORDINAL_POSITION ASC`,
      [dbName]
    );

    const tableColumnsMap = new Map<string, ColumnSchemaInfo[]>();
    for (const col of columnsRows) {
      const tableName = col.TABLE_NAME as string;
      const colName = col.COLUMN_NAME as string;
      const colInfo: ColumnSchemaInfo = {
        comment: col.COLUMN_COMMENT || undefined,
        dataType: (col.COLUMN_TYPE || col.DATA_TYPE) as string,
        isNullable: col.IS_NULLABLE === 'YES',
        isPrimaryKey: col.COLUMN_KEY === 'PRI',
        isSensitive: isSensitiveColumn(colName),
        name: colName,
      };

      if (!tableColumnsMap.has(tableName)) {
        tableColumnsMap.set(tableName, []);
      }
      tableColumnsMap.get(tableName)!.push(colInfo);
    }

    const tables: TableSchemaInfo[] = tablesRows.map((t) => {
      const tableName = t.TABLE_NAME as string;
      return {
        columns: tableColumnsMap.get(tableName) || [],
        comment: t.TABLE_COMMENT || undefined,
        name: tableName,
        rowCountEstimate: Number(t.TABLE_ROWS || 0),
      };
    });

    return {
      engine: 'MySQL 8.x',
      name: dbName,
      tables,
      type: 'mysql',
    };
  }

  private static async getCassandraSchema(): Promise<DatabaseSchemaInfo> {
    const client = getCassandraClient();
    const keyspace = adminConfig.cassandra.keyspace;

    const [tablesResult, columnsResult] = await Promise.all([
      client.execute(
        'SELECT table_name, comment FROM system_schema.tables WHERE keyspace_name = ?',
        [keyspace],
        { prepare: false }
      ),
      client.execute(
        'SELECT table_name, column_name, type, kind FROM system_schema.columns WHERE keyspace_name = ?',
        [keyspace],
        { prepare: false }
      ),
    ]);

    const tableColumnsMap = new Map<string, ColumnSchemaInfo[]>();
    for (const row of columnsResult.rows) {
      const tableName = row.table_name as string;
      const colName = row.column_name as string;
      const kind = row.kind as string;
      const isPartition = kind === 'partition_key';
      const isClustering = kind === 'clustering';
      const colInfo: ColumnSchemaInfo = {
        dataType: row.type as string,
        isClusteringKey: isClustering,
        isNullable: true,
        isPartitionKey: isPartition,
        isPrimaryKey: isPartition || isClustering,
        isSensitive: isSensitiveColumn(colName),
        name: colName,
      };

      if (!tableColumnsMap.has(tableName)) {
        tableColumnsMap.set(tableName, []);
      }
      tableColumnsMap.get(tableName)!.push(colInfo);
    }

    const tables: TableSchemaInfo[] = tablesResult.rows
      .map((row) => {
        const tableName = row.table_name as string;
        const columns = tableColumnsMap.get(tableName) || [];
        return {
          columns,
          comment: row.comment || undefined,
          name: tableName,
          rowCountEstimate: -1,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      engine: 'Apache Cassandra 4.x',
      name: keyspace,
      tables,
      type: 'cassandra',
    };
  }

  static async executeReadOnlyQuery(
    database: DatabaseEngine,
    rawQuery: string,
    actor: { email?: string | null; id: string; role: string; username: string },
    ipAddress: string
  ): Promise<QueryExecutionResult> {
    if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
      throw new Error('La consulta no puede estar vacía.');
    }

    if (database !== 'mysql' && database !== 'cassandra') {
      throw new Error('Motor de base de datos no válido. Opciones permitidas: mysql o cassandra.');
    }

    const stripped = rawQuery.trim().replace(/;+\s*$/, '');
    if (stripped.includes(';')) {
      throw new Error('Solo se permite ejecutar una única instrucción por consulta.');
    }

    const forbiddenKeywords = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|RENAME|GRANT|REVOKE|FLUSH|KILL|LOCK|UNLOCK|SET|CALL|REPLACE|EXECUTE|LOAD|OUTFILE|DUMPFILE)\b/i;
    if (forbiddenKeywords.test(stripped)) {
      throw new Error('Operación no permitida: La consola de análisis opera estrictamente en modo de solo lectura (SELECT/SHOW/DESCRIBE/EXPLAIN).');
    }

    if (database === 'mysql') {
      if (!/^(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i.test(stripped)) {
        throw new Error('Consulta no válida: MySQL solo admite sentencias SELECT, SHOW, DESCRIBE o EXPLAIN.');
      }
    } else {
      if (!/^SELECT\b/i.test(stripped)) {
        throw new Error('Consulta no válida: Cassandra solo admite sentencias SELECT.');
      }
    }

    let finalQuery = stripped;
    const isSelect = /^SELECT\b/i.test(stripped);
    if (isSelect) {
      const limitMatch = stripped.match(/\bLIMIT\s+(\d+)/i);
      if (!limitMatch) {
        finalQuery = `${stripped} LIMIT 200`;
      } else {
        const limitVal = parseInt(limitMatch[1], 10);
        if (limitVal > 1000) {
          finalQuery = stripped.replace(/\bLIMIT\s+\d+/i, 'LIMIT 1000');
        }
      }
    }

    const startTime = performance.now();
    try {
      let columns: string[] = [];
      let rows: Record<string, unknown>[] = [];

      if (database === 'mysql') {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Tiempo de espera agotado al ejecutar la consulta (límite: 5000ms).')), 5000);
        });

        const queryPromise = adminDbPool.query<any[]>({
          sql: finalQuery,
          timeout: 5000,
        });

        const [results] = await Promise.race([queryPromise, timeoutPromise]);
        if (Array.isArray(results)) {
          if (results.length > 0) {
            columns = Object.keys(results[0]);
            rows = results.map((r) => {
              const rowObj: Record<string, unknown> = {};
              for (const col of columns) {
                rowObj[col] = isSensitiveColumn(col) && r[col] !== null && r[col] !== undefined
                  ? '••••••••[ENMASCARADO]••••••••'
                  : r[col];
              }
              return rowObj;
            });
          }
        }
      } else {
        const client = getCassandraClient();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Tiempo de espera agotado al ejecutar la consulta en Cassandra (límite: 5000ms).')), 5000);
        });

        const queryPromise = client.execute(finalQuery, [], {
          prepare: false,
          readTimeout: 5000,
        });

        const result = await Promise.race([queryPromise, timeoutPromise]);
        if (result.columns && result.columns.length > 0) {
          columns = result.columns.map((c) => c.name);
        } else if (result.rows.length > 0) {
          columns = Object.keys(result.rows[0]);
        }

        rows = result.rows.map((row) => {
          const rowObj: Record<string, unknown> = {};
          for (const col of columns) {
            const rawVal = (row as any)[col];
            rowObj[col] = isSensitiveColumn(col) && rawVal !== null && rawVal !== undefined
              ? '••••••••[ENMASCARADO]••••••••'
              : serializeCassandraValue(rawVal);
          }
          return rowObj;
        });
      }

      const executionTimeMs = Math.round(performance.now() - startTime);

      await SecurityAuditService.recordAdminAction({
        action: 'ANALYTICS_QUERY_EXECUTED',
        actorEmail: actor.email,
        actorId: actor.id,
        actorRole: actor.role,
        actorUsername: actor.username,
        details: {
          database,
          executionTimeMs,
          query: finalQuery.slice(0, 500),
          rowCount: rows.length,
        },
        ipAddress,
        status: 'success',
        targetId: database,
        targetName: database === 'mysql' ? adminConfig.db.name : adminConfig.cassandra.keyspace,
        targetType: 'DATABASE_QUERY',
      });

      return {
        columns,
        database,
        executionTimeMs,
        query: finalQuery,
        rowCount: rows.length,
        rows,
        success: true,
      };
    } catch (err) {
      const executionTimeMs = Math.round(performance.now() - startTime);
      const errorMessage = (err as Error).message || 'Error inesperado al ejecutar la consulta analítica.';

      await SecurityAuditService.recordAdminAction({
        action: 'ANALYTICS_QUERY_FAILED',
        actorEmail: actor.email,
        actorId: actor.id,
        actorRole: actor.role,
        actorUsername: actor.username,
        details: {
          database,
          error: errorMessage,
          executionTimeMs,
          query: stripped.slice(0, 500),
        },
        ipAddress,
        status: 'failure',
        targetId: database,
        targetName: database === 'mysql' ? adminConfig.db.name : adminConfig.cassandra.keyspace,
        targetType: 'DATABASE_QUERY',
      });

      logger.db.warn('Fallo en ejecución de consulta analítica', {
        actor: actor.username,
        database,
        error: errorMessage,
        query: stripped,
      });

      throw new Error(errorMessage);
    }
  }

  static getQueryTemplates(): QueryTemplate[] {
    return [
      {
        category: 'Usuarios y Crecimiento',
        database: 'mysql',
        description: 'Muestra el número de nuevos usuarios registrados por día en los últimos 30 días con desglose de suscriptores.',
        id: 'mysql-user-growth',
        query: `SELECT DATE(created_at) AS fecha, COUNT(*) AS nuevos_usuarios, SUM(CASE WHEN subscription_status = 'active' THEN 1 ELSE 0 END) AS suscriptores_activos FROM users GROUP BY DATE(created_at) ORDER BY fecha DESC LIMIT 30;`,
        title: 'Crecimiento diario de registros de usuarios',
      },
      {
        category: 'Organizaciones B2B',
        database: 'mysql',
        description: 'Distribución de organizaciones corporativas por tipo de empresa, estado de suscripción y promedio de asientos contratados.',
        id: 'mysql-org-metrics',
        query: `SELECT org_type, subscription_status, COUNT(*) AS total_orgs, AVG(seat_limit) AS promedio_asientos FROM organizations GROUP BY org_type, subscription_status ORDER BY total_orgs DESC;`,
        title: 'Métricas de organizaciones por nivel y estado',
      },
      {
        category: 'Recursos Humanos',
        database: 'mysql',
        description: 'Conteo de empleados activos y salario promedio por cada departamento corporativo.',
        id: 'mysql-hr-departments',
        query: `SELECT d.name AS departamento, COUNT(e.id) AS total_empleados, AVG(e.salary) AS salario_promedio FROM hr_departments d LEFT JOIN hr_employees e ON d.id = e.department_id AND e.status = 'active' GROUP BY d.id, d.name ORDER BY total_empleados DESC;`,
        title: 'Empleados y salarios por departamento RRHH',
      },
      {
        category: 'Soporte y Operaciones',
        database: 'mysql',
        description: 'Agrupación de tickets internos por estado actual, prioridad y categoría de problema.',
        id: 'mysql-tickets-summary',
        query: `SELECT status, priority, category, COUNT(*) AS total_tickets FROM internal_tickets GROUP BY status, priority, category ORDER BY total_tickets DESC;`,
        title: 'Resumen de tickets internos por estado y prioridad',
      },
      {
        category: 'Monetización y Finanzas',
        database: 'mysql',
        description: 'Listado de las últimas 50 transacciones y compras procesadas con importes y divisas.',
        id: 'mysql-purchases-recent',
        query: `SELECT p.id, u.username, p.amount, p.currency, p.plan_type, p.status, p.created_at FROM purchases p JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC LIMIT 50;`,
        title: 'Últimas transacciones y compras procesadas',
      },
      {
        category: 'Auditoría y Seguridad',
        database: 'cassandra',
        description: 'Consulta los 50 eventos de auditoría administrativa inmutable más recientes registrados en Cassandra.',
        id: 'cassandra-audit-recent',
        query: `SELECT event_date, created_at, log_id, actor_username, actor_role, action, target_type, status, ip_address FROM admin_audit_logs LIMIT 50;`,
        title: 'Auditoría administrativa inmutable reciente',
      },
      {
        category: 'Soporte y Calidad',
        database: 'cassandra',
        description: 'Muestra las calificaciones de satisfacción y feedback otorgadas por usuarios a agentes de soporte.',
        id: 'cassandra-ratings-today',
        query: `SELECT bucket_date, rated_at, rating_id, agent_name, rating, tier, feedback_comment, user_name FROM support_ratings_by_date LIMIT 50;`,
        title: 'Calificaciones de calidad a agentes de soporte',
      },
      {
        category: 'Soporte y Calidad',
        database: 'cassandra',
        description: 'Rastro de auditoría inmutable de eventos del ciclo de vida de los chats de soporte.',
        id: 'cassandra-chats-audit',
        query: `SELECT chat_id, event_time, audit_id, actor_name, actor_type, event_type, current_status, current_tier, subject FROM support_chats_audit LIMIT 50;`,
        title: 'Rastro inmutable de sesiones de soporte',
      },
      {
        category: 'Telemetría y Rendimiento',
        database: 'cassandra',
        description: 'Métricas de latencia y código de estado por endpoint de la API.',
        id: 'cassandra-api-latency',
        query: `SELECT endpoint, bucket_hour, status_code, event_id, duration_ms, method, timestamp FROM api_latency_metrics LIMIT 50;`,
        title: 'Métricas de latencia y desempeño de endpoints API',
      },
      {
        category: 'Telemetría y Rendimiento',
        database: 'cassandra',
        description: 'Registro de errores frontend capturados en clientes web para depuración.',
        id: 'cassandra-client-errors',
        query: `SELECT error_fingerprint, bucket_date, event_id, error_message, error_type, route, timestamp FROM client_errors LIMIT 50;`,
        title: 'Registro de errores frontend en aplicaciones web',
      },
    ];
  }
}
