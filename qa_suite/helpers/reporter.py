import sys
import time
from dataclasses import dataclass, field
from typing import List, Optional

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


@dataclass
class TestResult:
    suite: str
    name: str
    status: str  # "PASS", "FAIL", "SKIP"
    duration_ms: float
    details: Optional[str] = None


class TestReporter:
    def __init__(self):
        self.results: List[TestResult] = []
        self.suite_name = ""
        self.suite_start_time = 0.0

    def start_suite(self, name: str):
        self.suite_name = name
        self.suite_start_time = time.time()
        print("\n" + "=" * 80)
        print(f"[*] INICIANDO SUITE DE PRUEBAS: {name.upper()}")
        print("=" * 80)

    def log(self, name: str, status: str, duration_ms: float, details: Optional[str] = None):
        res = TestResult(
            suite=self.suite_name,
            name=name,
            status=status,
            duration_ms=duration_ms,
            details=details,
        )
        self.results.append(res)

        badge = "\033[92m[PASS]\033[0m" if status == "PASS" else "\033[91m[FAIL]\033[0m" if status == "FAIL" else "\033[93m[SKIP]\033[0m"
        time_str = f"{duration_ms:.0f}ms"
        print(f"  {badge}  {name:<55} {time_str:>8}")
        if status == "FAIL" and details:
            print(f"         \033[91m+-- Error: {details}\033[0m")

    def print_summary(self) -> int:
        total = len(self.results)
        passed = sum(1 for r in self.results if r.status == "PASS")
        failed = sum(1 for r in self.results if r.status == "FAIL")
        skipped = sum(1 for r in self.results if r.status == "SKIP")
        total_time = sum(r.duration_ms for r in self.results) / 1000.0

        print("\n" + "=" * 80)
        print("[-] RESUMEN FINAL DE EJECUCIÓN QA")
        print("=" * 80)
        print(f"  Total Pruebas:   {total}")
        print(f"  \033[92mSuperadas:\033[0m       {passed}")
        print(f"  \033[91mFallidas:\033[0m        {failed}")
        if skipped > 0:
            print(f"  \033[93mOmitidas:\033[0m        {skipped}")
        print(f"  Tiempo total:    {total_time:.2f}s")
        print("=" * 80)

        if failed == 0:
            print("\033[92m[OK] TODAS LAS PRUEBAS HAN FINALIZADO EXITOSAMENTE (100% PASS)\033[0m\n")
            return 0
        else:
            print(f"\033[91m[!] SE DETECTARON {failed} FALLOS EN LA SUITE.\033[0m\n")
            return 1
