import argparse
import sys
from qa_suite.helpers.reporter import TestReporter
from qa_suite.suites.test_all_tools import run_tools_suite
from qa_suite.suites.test_web_e2e import run_web_e2e_suite


def main():
    parser = argparse.ArgumentParser(
        description="Project Aurora - Suite Automatizada de Pruebas y QA (100% Tools & Web E2E)"
    )
    parser.add_argument(
        "--suite",
        choices=["all", "tools", "web"],
        default="all",
        help="Suite a ejecutar: 'tools' (todas las PDF tools), 'web' (E2E browser), o 'all' (ambas)",
    )
    parser.add_argument(
        "--no-headless",
        action="store_true",
        help="Ejecutar el navegador de pruebas Web en modo visual con ventana visible",
    )

    args = parser.parse_args()
    reporter = TestReporter()

    print("\n" + "=" * 80)
    print("   PROJECT AURORA - SUITE MODULAR DE PRUEBAS AUTOMATIZADAS (QA)   ")
    print("=" * 80)

    try:
        if args.suite in ["all", "tools"]:
            run_tools_suite(reporter)

        if args.suite in ["all", "web"]:
            headless = not args.no_headless
            run_web_e2e_suite(reporter, headless=headless)

    except KeyboardInterrupt:
        print("\n\033[93m[WARN] Ejecución interrumpida por el usuario.\033[0m")
        sys.exit(130)

    exit_code = reporter.print_summary()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
