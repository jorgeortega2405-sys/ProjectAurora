import datetime
import hashlib
import json
import logging
import os
import signal
import sys
import time
import uuid
from typing import Any, Dict, List, Optional
from cassandra.cluster import Cluster, Session
from cassandra.policies import DCAwareRoundRobinPolicy, RetryPolicy
from cassandra.util import Date
import redis

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('telemetry-worker')

REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', None)
REDIS_QUEUE = os.getenv('REDIS_QUEUE', 'telemetry:queue:incoming')
CASSANDRA_HOST = os.getenv('CASSANDRA_HOST', 'localhost')
CASSANDRA_PORT = int(os.getenv('CASSANDRA_PORT', '9042'))
CASSANDRA_KEYSPACE = os.getenv('CASSANDRA_KEYSPACE', 'aurora_telemetry')
BATCH_SIZE = int(os.getenv('BATCH_SIZE', '100'))
BATCH_TIMEOUT_SECONDS = float(os.getenv('BATCH_TIMEOUT_SECONDS', '2.0'))

running = True

def signal_handler(signum, frame):
    global running
    logger.info("Seal de terminacin recibida. Deteniendo worker...")
    running = False

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def connect_redis() -> redis.Redis:
    while running:
        try:
            client = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                password=REDIS_PASSWORD,
                decode_responses=True,
                socket_timeout=5,
                retry_on_timeout=True
            )
            client.ping()
            logger.info("Conexin exitosa con Redis en %s:%s", REDIS_HOST, REDIS_PORT)
            return client
        except Exception as e:
            logger.warning("Esperando por Redis (%s:%s): %s", REDIS_HOST, REDIS_PORT, e)
            time.sleep(3)
    sys.exit(0)

def connect_cassandra() -> tuple[Cluster, Session]:
    while running:
        try:
            cluster = Cluster(
                [CASSANDRA_HOST],
                port=CASSANDRA_PORT,
                load_balancing_policy=DCAwareRoundRobinPolicy(local_dc='datacenter1'),
                protocol_version=4,
                connect_timeout=15
            )
            session = cluster.connect()
            logger.info("Conexión exitosa con cluster Cassandra en %s:%s", CASSANDRA_HOST, CASSANDRA_PORT)
            ensure_schema(session)
            session.set_keyspace(CASSANDRA_KEYSPACE)
            return cluster, session
        except Exception as e:
            logger.warning("Esperando por Cassandra (%s:%s): %s", CASSANDRA_HOST, CASSANDRA_PORT, e)
            time.sleep(5)
    sys.exit(0)

def ensure_schema(session: Session) -> None:
    session.execute(f"""
        CREATE KEYSPACE IF NOT EXISTS {CASSANDRA_KEYSPACE}
        WITH replication = {{
            'class': 'SimpleStrategy',
            'replication_factor': 1
        }};
    """)
    session.set_keyspace(CASSANDRA_KEYSPACE)

    session.execute("""
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
    """)

    session.execute("""
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
    """)

    session.execute("""
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
    """)

    session.execute("""
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
    """)

    session.execute("""
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
    """)
    logger.info("Esquema y tablas de Cassandra validados en keyspace '%s'.", CASSANDRA_KEYSPACE)

def prepare_statements(session: Session) -> Dict[str, Any]:
    return {
        'insert_raw': session.prepare(f"""
            INSERT INTO {CASSANDRA_KEYSPACE}.events_raw (
                session_id, event_date, event_id, timestamp, event_type, user_id, route, url, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """),
        'insert_performance': session.prepare(f"""
            INSERT INTO {CASSANDRA_KEYSPACE}.performance_metrics (
                metric_name, bucket_hour, route, event_id, timestamp, value, rating, device_type, connection_type, session_id, user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """),
        'insert_ui': session.prepare(f"""
            INSERT INTO {CASSANDRA_KEYSPACE}.ui_interactions (
                app_tenant, bucket_date, element_ref, event_id, timestamp, action_type, route, session_id, user_id, meta_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """),
        'insert_api': session.prepare(f"""
            INSERT INTO {CASSANDRA_KEYSPACE}.api_latency_metrics (
                endpoint, bucket_hour, status_code, event_id, timestamp, method, duration_ms, session_id, user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """),
        'insert_error': session.prepare(f"""
            INSERT INTO {CASSANDRA_KEYSPACE}.client_errors (
                error_fingerprint, bucket_date, event_id, timestamp, error_type, error_message, error_stack, route, user_agent, session_id, user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """),
    }

def fetch_batch_from_redis(redis_client: redis.Redis) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    first_item = redis_client.blpop(REDIS_QUEUE, timeout=int(BATCH_TIMEOUT_SECONDS))
    if not first_item:
        return events

    try:
        events.append(json.loads(first_item[1]))
    except Exception:
        pass

    pipeline = redis_client.pipeline()
    for _ in range(BATCH_SIZE - 1):
        pipeline.lpop(REDIS_QUEUE)
    additional_items = pipeline.execute()

    for item in additional_items:
        if item:
            try:
                events.append(json.loads(item))
            except Exception:
                pass

    return events

def process_batch(events: List[Dict[str, Any]], session: Session, statements: Dict[str, Any]) -> None:
    futures = []

    for ev in events:
        try:
            raw_ts = ev.get('timestamp')
            if raw_ts:
                try:
                    dt = datetime.datetime.fromisoformat(str(raw_ts).replace('Z', '+00:00'))
                except Exception:
                    dt = datetime.datetime.now(datetime.timezone.utc)
            else:
                dt = datetime.datetime.now(datetime.timezone.utc)

            event_date = Date(dt.date())
            bucket_hour = dt.replace(minute=0, second=0, microsecond=0)
            event_id = uuid.uuid1()
            session_id = str(ev.get('session_id') or 'anonymous_session')
            user_id = str(ev.get('user_id') or 'anonymous')
            event_type = str(ev.get('type') or 'generic')
            route = str(ev.get('route') or '/')
            url = str(ev.get('url') or '')
            payload_str = json.dumps(ev.get('payload', {}), ensure_ascii=False)

            futures.append(session.execute_async(statements['insert_raw'], [
                session_id, event_date, event_id, dt, event_type, user_id, route, url, payload_str
            ]))

            payload = ev.get('payload', {})
            if not isinstance(payload, dict):
                payload = {}

            if event_type in ('web_vital', 'page_view', 'route_transition'):
                metric_name = str(payload.get('metric_name') or event_type.upper())
                value = float(payload.get('value', payload.get('duration_ms', 0.0)) or 0.0)
                rating = str(payload.get('rating') or 'unknown')
                device_type = str(payload.get('device_type') or 'desktop')
                conn_type = str(payload.get('connection_type') or 'unknown')

                futures.append(session.execute_async(statements['insert_performance'], [
                    metric_name, bucket_hour, route, event_id, dt, value, rating, device_type, conn_type, session_id, user_id
                ]))

            elif event_type in ('click', 'interaction'):
                app_tenant = str(payload.get('tenant') or 'aurora-web')
                element_ref = str(payload.get('element_ref') or payload.get('target') or 'unknown')
                action_type = str(payload.get('action') or 'click')
                meta_json = json.dumps(payload, ensure_ascii=False)

                futures.append(session.execute_async(statements['insert_ui'], [
                    app_tenant, event_date, element_ref, event_id, dt, action_type, route, session_id, user_id, meta_json
                ]))

            elif event_type in ('api_latency', 'network_call'):
                endpoint = str(payload.get('endpoint') or '/api/unknown')
                status_code = int(payload.get('status', payload.get('status_code', 200)) or 200)
                method = str(payload.get('method') or 'GET')
                duration_ms = float(payload.get('duration_ms', 0.0) or 0.0)

                futures.append(session.execute_async(statements['insert_api'], [
                    endpoint, bucket_hour, status_code, event_id, dt, method, duration_ms, session_id, user_id
                ]))

            elif event_type in ('error', 'exception'):
                error_type = str(payload.get('error_type') or 'JavaScriptError')
                error_msg = str(payload.get('message') or 'Unknown error')
                error_stack = str(payload.get('stack') or '')
                user_agent = str(payload.get('user_agent') or '')
                fingerprint_src = f"{error_type}:{error_msg}:{route}"
                fingerprint = hashlib.sha256(fingerprint_src.encode('utf-8')).hexdigest()[:32]

                futures.append(session.execute_async(statements['insert_error'], [
                    fingerprint, event_date, event_id, dt, error_type, error_msg, error_stack, route, user_agent, session_id, user_id
                ]))

        except Exception as e:
            logger.warning("Error al procesar evento individual: %s", e)

    for future in futures:
        try:
            future.result()
        except Exception as e:
            logger.error("Error al persistir evento asíncrono en Cassandra: %s", e)

    logger.info("Lote de %d eventos procesado y volcado exitosamente en Cassandra.", len(events))

def main() -> None:
    logger.info("Iniciando Aurora Telemetry Worker...")
    redis_client = connect_redis()
    cluster, session = connect_cassandra()
    statements = prepare_statements(session)

    logger.info("Telemetry Worker en ejecucin. Escuchando cola '%s'...", REDIS_QUEUE)

    while running:
        try:
            events = fetch_batch_from_redis(redis_client)
            if events:
                process_batch(events, session, statements)
        except Exception as e:
            logger.error("Excepcin en bucle principal del worker: %s", e)
            time.sleep(2)

    try:
        cluster.shutdown()
        redis_client.close()
    except Exception:
        pass
    logger.info("Aurora Telemetry Worker detenido ordenadamente.")

if __name__ == '__main__':
    main()
