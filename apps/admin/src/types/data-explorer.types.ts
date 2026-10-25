export type DatabaseEngine = 'cassandra' | 'mysql';

export interface ColumnSchemaInfo {
  comment?: string;
  dataType: string;
  isClusteringKey?: boolean;
  isNullable: boolean;
  isPartitionKey?: boolean;
  isPrimaryKey: boolean;
  isSensitive: boolean;
  name: string;
}

export interface TableSchemaInfo {
  columns: ColumnSchemaInfo[];
  comment?: string;
  name: string;
  rowCountEstimate: number;
}

export interface DatabaseSchemaInfo {
  engine: string;
  name: string;
  tables: TableSchemaInfo[];
  type: DatabaseEngine;
}

export interface SchemaDiscoveryResponse {
  cassandra: DatabaseSchemaInfo;
  mysql: DatabaseSchemaInfo;
}

export interface QueryExecutionResult {
  columns: string[];
  database: DatabaseEngine;
  executionTimeMs: number;
  query: string;
  rowCount: number;
  rows: Record<string, unknown>[];
  success: boolean;
}

export interface QueryTemplate {
  category: string;
  database: DatabaseEngine;
  description: string;
  id: string;
  query: string;
  title: string;
}
