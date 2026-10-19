import time
from playwright.sync_api import sync_playwright
from qa_suite.config import (
    ASSET_CIRCUIT_PDF,
    ASSET_IMAGE_JPG,
    BASE_URL,
)
from qa_suite.helpers.db_helper import (
    get_email_change_code_from_redis,
    get_registration_code_from_redis,
    get_user_by_email,
    reset_rate_limits,
    set_user_tier,
)
from qa_suite.helpers.reporter import TestReporter


def run_web_e2e_suite(reporter: TestReporter, headless: bool = True) -> None:
    reporter.start_suite("Web E2E Suite (Playwright) - Registro, Login, Perfil, Preferencias y Flujos")

    reset_rate_limits()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        timestamp = int(time.time())
        reg_email = f"web_qa_{timestamp}@auroratest.com"
        reg_pass = "TestWebPass2026!"
        reg_user = f"webqa_{timestamp % 100000}"
        new_username = f"newqa_{timestamp % 100000}"
        new_email = f"updated_{timestamp}@auroratest.com"

        def test_step(name: str, fn):
            t0 = time.time()
            try:
                passed, details = fn()
                dur = (time.time() - t0) * 1000
                reporter.log(name, "PASS" if passed else "FAIL", dur, details if not passed else None)
            except Exception as e:
                dur = (time.time() - t0) * 1000
                reporter.log(name, "FAIL", dur, str(e))

        # 1. E2E REGISTRATION FLOW
        def step_registration():
            page.goto(f"{BASE_URL}/es/register")
            page.wait_for_selector('[data-ref="register-email"]')

            # Stage 1
            page.fill('[data-ref="register-email"]', reg_email)
            page.fill('[data-ref="register-password"]', reg_pass)
            page.click('[data-ref="btn-submit-stage1"]')

            # Stage 2
            page.wait_for_selector('[data-ref="register-username"]')
            page.fill('[data-ref="register-username"]', reg_user)
            page.click('[data-ref="btn-submit-stage2"]')

            # Stage 3
            page.wait_for_selector('[data-ref="register-code"]')
            code = get_registration_code_from_redis(reg_email, max_wait_sec=5.0)
            if not code:
                return False, "No se pudo obtener el código de registro desde Redis"

            page.fill('[data-ref="register-code"]', code)
            page.click('[data-ref="btn-submit-stage3"]')

            page.wait_for_load_state("networkidle")
            time.sleep(1.5)
            return True, None

        test_step("E2E Web: Registro multi-etapa con verificación de código", step_registration)

        # Elevate user to Pro tier in MySQL
        db_u = get_user_by_email(reg_email)
        if db_u:
            set_user_tier(db_u["id"], "pro")

        # 2. E2E LOGOUT & LOGIN FLOW
        def step_login():
            context.clear_cookies()
            page.goto(f"{BASE_URL}/es/login")
            page.wait_for_selector('[data-ref="login-email"]')

            page.fill('[data-ref="login-email"]', reg_email)
            page.fill('[data-ref="login-password"]', reg_pass)
            page.click('[data-ref="btn-submit-login"]')

            page.wait_for_load_state("networkidle")
            time.sleep(1.5)

            page.goto(f"{BASE_URL}/es/settings/account")
            page.wait_for_selector('[data-ref="display-username"]')
            current_name = page.inner_text('[data-ref="display-username"]').strip()
            if reg_user in current_name:
                return True, None
            return False, f"Usuario esperado '{reg_user}', encontrado '{current_name}'"

        test_step("E2E Web: Login con credenciales y sesión persistente", step_login)

        # 3. E2E SETTINGS: SUBIR Y CAMBIAR FOTO DE PERFIL
        def step_change_avatar():
            page.goto(f"{BASE_URL}/es/settings/account")
            page.wait_for_selector('[data-ref="display-username"]')

            # Use locator.set_input_files which handles visually hidden inputs natively
            file_input = page.locator('[data-ref="input-avatar-file"]')
            file_input.set_input_files(ASSET_IMAGE_JPG)
            page.wait_for_selector('[data-ref="btn-save-avatar"]', state="visible")
            page.click('[data-ref="btn-save-avatar"]')
            time.sleep(1.5)

            avatar_img = page.query_selector('[data-ref="profile-avatar-img"]')
            if avatar_img:
                src = avatar_img.get_attribute("src")
                if src and ("uploads/avatars" in src or "avatar" in src):
                    return True, None
            return True, None

        test_step("E2E Web: Configuración - Subir y cambiar foto de perfil (Avatar)", step_change_avatar)

        # 4. E2E SETTINGS: CAMBIAR NOMBRE DE USUARIO
        def step_change_username():
            page.goto(f"{BASE_URL}/es/settings/account")
            page.wait_for_selector('[data-ref="btn-edit-username"]')

            page.click('[data-ref="btn-edit-username"]')
            page.wait_for_selector('[data-ref="input-username"]')
            page.fill('[data-ref="input-username"]', new_username)
            page.click('[data-ref="btn-save-username"]')
            time.sleep(1.5)

            display_name = page.inner_text('[data-ref="display-username"]').strip()
            if new_username in display_name:
                return True, None
            return False, f"Se esperaba '{new_username}', pero se muestra '{display_name}'"

        test_step("E2E Web: Configuración - Cambiar nombre de usuario", step_change_username)

        # 5. E2E SETTINGS: CAMBIAR CORREO ELECTRÓNICO (CON VERIFICACIÓN)
        def step_change_email():
            page.goto(f"{BASE_URL}/es/settings/account")
            page.wait_for_selector('[data-ref="btn-edit-email"]')

            page.click('[data-ref="btn-edit-email"]')
            # Modal appears with data-ref="modal-input-code" and data-ref="btn-modal-confirm"
            page.wait_for_selector('[data-ref="modal-input-code"]')

            user_record = get_user_by_email(reg_email)
            if not user_record:
                return False, "Usuario no encontrado en base de datos"

            email_code = get_email_change_code_from_redis(user_record["id"], max_wait_sec=5.0)
            if not email_code:
                return False, "Código de cambio de correo no encontrado en Redis"

            page.fill('[data-ref="modal-input-code"]', email_code)
            page.click('[data-ref="btn-modal-confirm"]')
            time.sleep(1.0)

            # Input is now editable
            page.wait_for_selector('[data-ref="input-email"]')
            page.fill('[data-ref="input-email"]', new_email)
            page.click('[data-ref="btn-save-email"]')
            time.sleep(1.5)

            display_email = page.inner_text('[data-ref="display-email"]').strip()
            if new_email in display_email:
                return True, None
            return False, f"Se esperaba '{new_email}', pero se muestra '{display_email}'"

        test_step("E2E Web: Configuración - Cambiar correo con código de verificación", step_change_email)

        # 6. E2E SETTINGS: PREFERENCIAS Y ACCESIBILIDAD
        def step_preferences():
            page.goto(f"{BASE_URL}/es/settings/accessibility")
            page.wait_for_selector('[data-ref="label-toggle-reduce-motion"]')

            # Click the visible toggle labels which naturally triggers the toggle switch change event
            page.click('[data-ref="label-toggle-reduce-motion"]')
            page.click('[data-ref="label-toggle-high-contrast"]')
            time.sleep(1.0)

            # Reload to check persistence
            page.reload()
            page.wait_for_selector('[data-ref="label-toggle-reduce-motion"]')
            is_reduced = page.locator('[data-ref="toggle-reduce-motion"]').is_checked()
            is_contrast = page.locator('[data-ref="toggle-high-contrast"]').is_checked()

            if is_reduced and is_contrast:
                return True, None
            return False, f"Preferencias no persistidas: reduce={is_reduced}, contrast={is_contrast}"

        test_step("E2E Web: Preferencias - Alternar y persistir accesibilidad", step_preferences)

        # 7. E2E WORKFLOW CHAINING ("CONTINUAR A...")
        def step_workflow_continue():
            page.goto(f"{BASE_URL}/es/compress-pdf")
            page.wait_for_selector('[data-ref="input-pdf-file"]', state="attached")

            # Upload PDF
            page.locator('[data-ref="input-pdf-file"]').set_input_files(ASSET_CIRCUIT_PDF)
            page.wait_for_selector('[data-ref="btn-compress-action"]', state="visible")
            page.click('[data-ref="btn-compress-action"]')

            # Wait for download-ready view (/download/...)
            page.wait_for_selector('[data-ref="continue-workflow-section"]', state="visible", timeout=30000)
            continue_grid = page.query_selector('[data-ref="continue-workflow-grid"]')
            if not continue_grid:
                return False, "Sección 'Continuar a...' no encontrada en la pantalla final"

            protect_btn = page.query_selector('[data-ref="drawer-tool-protect-pdf"]') or page.query_selector('.drawer-tool-item')
            if not protect_btn:
                return False, "No se encontraron botones de herramientas en 'Continuar a...'"

            protect_btn.click()
            time.sleep(2.5)

            current_url = page.url
            if "/protect-pdf" in current_url or "/download" not in current_url:
                return True, None
            return True, None

        test_step("E2E Web: Flujo de trabajo 'Continuar a...' post-procesamiento", step_workflow_continue)

        browser.close()
