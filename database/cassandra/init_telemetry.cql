CREATE KEYSPACE IF NOT EXISTS aurora_telemetry
WITH replication = {
  'class': 'SimpleStrategy',
  'replication_factor': 1
};

USE aurora_telemetry;

CREATE TABLE IF NOT EXISTS events_raw (
  session_id text,
  event_date date,
  event_id timeuuid,
  timestamp timestamp,
  event_type text,
  user_id text,
  route text,
  url text,
  payload_json text,
  PRIMARY KEY ((session_id, event_date), event_id)
) WITH CLUSTERING ORDER BY (event_id DESC);

CREATE TABLE IF NOT EXISTS performance_metrics (
  metric_name text,
  bucket_hour timestamp,
  route text,
  event_id timeuuid,
  timestamp timestamp,
  value double,
  rating text,
  device_type text,
  connection_type text,
  session_id text,
  user_id text,
  PRIMARY KEY ((metric_name, bucket_hour), route, event_id)
) WITH CLUSTERING ORDER BY (route ASC, event_id DESC);

CREATE TABLE IF NOT EXISTS ui_interactions (
  app_tenant text,
  bucket_date date,
  element_ref text,
  event_id timeuuid,
  timestamp timestamp,
  action_type text,
  route text,
  session_id text,
  user_id text,
  meta_json text,
  PRIMARY KEY ((app_tenant, bucket_date), element_ref, event_id)
) WITH CLUSTERING ORDER BY (element_ref ASC, event_id DESC);

CREATE TABLE IF NOT EXISTS api_latency_metrics (
  endpoint text,
  bucket_hour timestamp,
  status_code int,
  event_id timeuuid,
  timestamp timestamp,
  method text,
  duration_ms double,
  session_id text,
  user_id text,
  PRIMARY KEY ((endpoint, bucket_hour), status_code, event_id)
) WITH CLUSTERING ORDER BY (status_code ASC, event_id DESC);

CREATE TABLE IF NOT EXISTS client_errors (
  error_fingerprint text,
  bucket_date date,
  event_id timeuuid,
  timestamp timestamp,
  error_type text,
  error_message text,
  error_stack text,
  route text,
  user_agent text,
  session_id text,
  user_id text,
  PRIMARY KEY ((error_fingerprint, bucket_date), event_id)
) WITH CLUSTERING ORDER BY (event_id DESC);
