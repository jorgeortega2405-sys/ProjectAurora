import json
import time
import pymysql
import redis
from qa_suite.config import MYSQL_CONFIG, REDIS_CONFIG


def get_db_connection():
    return pymysql.connect(**MYSQL_CONFIG)


def get_redis_client():
    return redis.Redis(**REDIS_CONFIG)


def get_user_by_email(email: str):
    conn = get_db_connection()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            cur.execute("SELECT * FROM users WHERE email = %s", (email.strip().lower(),))
            return cur.fetchone()
    finally:
        conn.close()


def set_user_tier(user_id: int, tier: str = "pro"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET subscription_tier = %s WHERE id = %s", (tier, user_id))
    finally:
        conn.close()


def add_ai_credits(user_id: int, credits_amount: int = 100):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET ai_credits_balance = ai_credits_balance + %s WHERE id = %s", (credits_amount, user_id))
    finally:
        conn.close()


def get_registration_code_from_redis(email: str, max_wait_sec: float = 3.0) -> str | None:
    r = get_redis_client()
    key = f"reg_pending:{email.strip().lower()}"
    start = time.time()
    while time.time() - start < max_wait_sec:
        raw = r.get(key)
        if raw:
            try:
                data = json.loads(raw)
                return str(data.get("code", ""))
            except Exception:
                return None
        time.sleep(0.2)
    return None


def get_email_change_code_from_redis(user_id: int | str, max_wait_sec: float = 3.0) -> str | None:
    r = get_redis_client()
    key = f"email_change:{user_id}"
    start = time.time()
    while time.time() - start < max_wait_sec:
        raw = r.get(key)
        if raw:
            try:
                data = json.loads(raw)
                return str(data.get("code", ""))
            except Exception:
                return None
        time.sleep(0.2)
    return None


def reset_rate_limits():
    r = get_redis_client()
    keys = r.keys("ratelimit:*") + r.keys("rate_limit:*")
    if keys:
        r.delete(*keys)
