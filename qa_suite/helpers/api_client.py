import json
import requests
from qa_suite.config import BASE_URL, API_URL
from qa_suite.helpers.db_helper import get_registration_code_from_redis


class AuroraApiClient:
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.session = requests.Session()
        self.current_user = None
        self._init_csrf()

    def _init_csrf(self):
        try:
            self.session.get(f"{self.base_url}/es")
            csrf_token = self.session.cookies.get("aurora_csrf_token")
            if csrf_token:
                self.session.headers.update({"x-csrf-token": csrf_token})
        except Exception as e:
            pass

    def ensure_csrf(self):
        token = self.session.cookies.get("aurora_csrf_token")
        if not token:
            self._init_csrf()
        else:
            self.session.headers.update({"x-csrf-token": token})

    def register(self, email: str, password: str, username: str):
        self.ensure_csrf()
        r1 = self.session.post(f"{self.api_url}/register/stage1-validate", json={"email": email, "password": password})
        if r1.status_code != 200:
            return False, r1.json()

        r2 = self.session.post(f"{self.api_url}/register/send-code", json={"email": email, "password": password, "username": username})
        if r2.status_code != 200:
            return False, r2.json()

        code = get_registration_code_from_redis(email)
        if not code:
            return False, {"error": "Verification code not found in Redis"}

        r3 = self.session.post(f"{self.api_url}/register/verify-code", json={"email": email, "code": code})
        if r3.status_code == 200:
            data = r3.json()
            self.current_user = data.get("user")
            self.ensure_csrf()
            return True, data
        return False, r3.json() if r3.content else {"error": r3.status_code}

    def login(self, email: str, password: str):
        self.ensure_csrf()
        r = self.session.post(f"{self.api_url}/login", json={"email": email, "password": password})
        if r.status_code == 200:
            data = r.json()
            self.current_user = data.get("user")
            self.ensure_csrf()
            return True, data
        return False, r.json()

    def post(self, path: str, **kwargs):
        self.ensure_csrf()
        url = path if path.startswith("http") else f"{self.base_url}{path}"
        return self.session.post(url, **kwargs)

    def get(self, path: str, **kwargs):
        url = path if path.startswith("http") else f"{self.base_url}{path}"
        return self.session.get(url, **kwargs)

    def delete(self, path: str, **kwargs):
        self.ensure_csrf()
        url = path if path.startswith("http") else f"{self.base_url}{path}"
        return self.session.delete(url, **kwargs)
