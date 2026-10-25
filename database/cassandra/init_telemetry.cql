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

CREATE TABLE IF NOT EXISTS support_chats_audit (
  chat_id text,
  event_time timestamp,
  audit_id timeuuid,
  event_type text,
  session_id text,
  user_id text,
  user_email text,
  user_name text,
  subject text,
  current_status text,
  current_tier text,
  actor_type text,
  actor_id text,
  actor_name text,
  payload_json text,
  PRIMARY KEY ((chat_id), event_time, audit_id)
) WITH CLUSTERING ORDER BY (event_time ASC, audit_id ASC);

CREATE TABLE IF NOT EXISTS support_messages_immutable (
  chat_id text,
  timestamp timestamp,
  message_id text,
  sender_type text,
  sender_id text,
  sender_name text,
  tier text,
  message text,
  PRIMARY KEY ((chat_id), timestamp, message_id)
) WITH CLUSTERING ORDER BY (timestamp ASC, message_id ASC);

CREATE TABLE IF NOT EXISTS support_chat_transfers (
  chat_id text,
  timestamp timestamp,
  transfer_id timeuuid,
  from_tier text,
  to_tier text,
  transferred_by_id text,
  transferred_by_name text,
  reason text,
  notes text,
  PRIMARY KEY ((chat_id), timestamp, transfer_id)
) WITH CLUSTERING ORDER BY (timestamp ASC, transfer_id ASC);

CREATE TABLE IF NOT EXISTS support_agent_ratings (
  agent_id text,
  rated_at timestamp,
  rating_id timeuuid,
  chat_id text,
  rating int,
  feedback_comment text,
  tier text,
  user_id text,
  user_email text,
  user_name text,
  PRIMARY KEY ((agent_id), rated_at, rating_id)
) WITH CLUSTERING ORDER BY (rated_at DESC, rating_id DESC);

CREATE TABLE IF NOT EXISTS support_ratings_by_date (
  bucket_date date,
  rated_at timestamp,
  rating_id timeuuid,
  agent_id text,
  agent_name text,
  chat_id text,
  rating int,
  feedback_comment text,
  tier text,
  user_name text,
  PRIMARY KEY ((bucket_date), rated_at, rating_id)
) WITH CLUSTERING ORDER BY (rated_at DESC, rating_id DESC);

CREATE TABLE IF NOT EXISTS support_agent_presence_logs (
  agent_id text,
  timestamp timestamp,
  event_id timeuuid,
  agent_name text,
  tier text,
  status text,
  previous_status text,
  note text,
  PRIMARY KEY ((agent_id), timestamp, event_id)
) WITH CLUSTERING ORDER BY (timestamp DESC, event_id DESC);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  event_date date,
  created_at timestamp,
  log_id timeuuid,
  actor_id text,
  actor_username text,
  actor_email text,
  actor_role text,
  action text,
  target_type text,
  target_id text,
  target_name text,
  details_json text,
  ip_address text,
  user_agent text,
  status text,
  checksum text,
  PRIMARY KEY ((event_date), created_at, log_id)
) WITH CLUSTERING ORDER BY (created_at DESC, log_id DESC);

CREATE TABLE IF NOT EXISTS admin_audit_by_target (
  target_type text,
  created_at timestamp,
  log_id timeuuid,
  event_date date,
  actor_id text,
  actor_username text,
  actor_email text,
  actor_role text,
  action text,
  target_id text,
  target_name text,
  details_json text,
  ip_address text,
  user_agent text,
  status text,
  checksum text,
  PRIMARY KEY ((target_type), created_at, log_id)
) WITH CLUSTERING ORDER BY (created_at DESC, log_id DESC);

CREATE TABLE IF NOT EXISTS security_access_logs (
  event_date date,
  created_at timestamp,
  access_id timeuuid,
  event_type text,
  identifier text,
  user_id text,
  ip_address text,
  user_agent text,
  failure_reason text,
  is_suspicious boolean,
  risk_score int,
  checksum text,
  PRIMARY KEY ((event_date), created_at, access_id)
) WITH CLUSTERING ORDER BY (created_at DESC, access_id DESC);

CREATE TABLE IF NOT EXISTS security_access_by_ip (
  ip_address text,
  created_at timestamp,
  access_id timeuuid,
  event_date date,
  event_type text,
  identifier text,
  user_id text,
  user_agent text,
  failure_reason text,
  is_suspicious boolean,
  risk_score int,
  checksum text,
  PRIMARY KEY ((ip_address), created_at, access_id)
) WITH CLUSTERING ORDER BY (created_at DESC, access_id DESC);

