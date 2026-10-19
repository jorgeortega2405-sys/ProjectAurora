import json
import time
from qa_suite.config import (
    ASSET_CIRCUIT_PDF,
    ASSET_DOCUMENT_HTML,
    ASSET_EXERCISES_PDF,
    ASSET_IMAGE_JPG,
    ASSET_NEGOCIACION_PDF,
    ASSET_PROTECTED_PDF,
    ASSET_TIMER_PDF,
)
from qa_suite.helpers.api_client import AuroraApiClient
from qa_suite.helpers.db_helper import add_ai_credits, get_user_by_email, reset_rate_limits, set_user_tier
from qa_suite.helpers.reporter import TestReporter


def run_tools_suite(reporter: TestReporter) -> None:
    reporter.start_suite("PDF Tools Suite - 100% de Herramientas y Opciones")

    reset_rate_limits()
    client = AuroraApiClient()

    # Create/authenticate a Pro test user with AI credits
    test_email = f"qa_tools_user_{int(time.time())}@auroratest.com"
    test_pass = "Aurora_Test_2026!"
    test_user = f"qa_tools_{int(time.time()) % 10000}"

    ok, res = client.register(test_email, test_pass, test_user)
    db_user = get_user_by_email(test_email)
    if db_user:
        set_user_tier(db_user["id"], "pro")
        add_ai_credits(db_user["id"], 500)
        client.login(test_email, test_pass)

    def test_endpoint(name: str, fn):
        t0 = time.time()
        try:
            passed, details = fn()
            dur = (time.time() - t0) * 1000
            reporter.log(name, "PASS" if passed else "FAIL", dur, details if not passed else None)
        except Exception as e:
            dur = (time.time() - t0) * 1000
            reporter.log(name, "FAIL", dur, str(e))

    # 1. COMPRESS-PDF (3 MODES)
    for level in ["recommended", "extreme", "low"]:
        def _test(lvl=level):
            with open(ASSET_CIRCUIT_PDF, "rb") as f:
                r = client.post("/api/tools/compress-pdf/compress",
                                files={"pdf": ("circuit.pdf", f, "application/pdf")},
                                data={"level": lvl})
                if r.status_code == 200 and r.json().get("success"):
                    return True, None
                return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
        test_endpoint(f"compress-pdf (modo: '{level}')", _test)

    # 2. SUMMARIZE-PDF (2 MODES)
    for mode in ["standard", "advanced"]:
        def _test(m=mode):
            with open(ASSET_NEGOCIACION_PDF, "rb") as f:
                r = client.post("/api/tools/summarize-pdf/summarize",
                                files={"pdf": ("negociacion.pdf", f, "application/pdf")},
                                data={"mode": m, "targetLength": "short"})
                if r.status_code == 200 and r.json().get("success"):
                    return True, None
                return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
        test_endpoint(f"summarize-pdf (modo: '{mode}')", _test)

    # 3. TRANSLATE-PDF (2 MODES)
    for mode in ["standard", "advanced"]:
        def _test(m=mode):
            with open(ASSET_TIMER_PDF, "rb") as f:
                r = client.post("/api/tools/translate-pdf/translate",
                                files={"file": ("timer.pdf", f, "application/pdf")},
                                data={"sourceLang": "auto", "targetLang": "en", "mode": m})
                if r.status_code == 200 and r.json().get("success"):
                    return True, None
                return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
        test_endpoint(f"translate-pdf (modo: '{mode}')", _test)

    # 4. PDF-CONVERTER (5 TARGET FORMATS)
    formats = [
        ("pdf-to-jpg", "pdf-to-jpg"),
        ("pdf-to-word", "pdf-to-word"),
        ("pdf-to-powerpoint", "pdf-to-powerpoint"),
        ("pdf-to-excel", "pdf-to-excel"),
        ("pdf-to-pdfa", "pdf-to-pdfa"),
    ]
    for label, target_type in formats:
        def _test(tt=target_type):
            with open(ASSET_CIRCUIT_PDF, "rb") as f:
                r = client.post("/api/tools/pdf-converter/convert",
                                files={"file": ("circuit.pdf", f, "application/pdf")},
                                data={"targetType": tt})
                if r.status_code == 200 and r.json().get("success"):
                    return True, None
                return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
        test_endpoint(f"pdf-converter ('{label}')", _test)

    # 5. TO-PDF-CONVERTER (2 SOURCE TYPES)
    def test_jpg_to_pdf():
        with open(ASSET_IMAGE_JPG, "rb") as f:
            r = client.post("/api/tools/to-pdf/convert",
                            files={"file": ("sample.jpg", f, "image/jpeg")},
                            data={"sourceType": "jpg-to-pdf", "orientation": "portrait"})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("to-pdf-converter ('jpg-to-pdf')", test_jpg_to_pdf)

    def test_html_to_pdf():
        with open(ASSET_DOCUMENT_HTML, "rb") as f:
            r = client.post("/api/tools/to-pdf/convert",
                            files={"file": ("document.html", f, "text/html")},
                            data={"sourceType": "html-to-pdf", "orientation": "portrait"})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("to-pdf-converter ('html-to-pdf')", test_html_to_pdf)

    # 6. PROTECT-PDF
    def test_protect():
        with open(ASSET_CIRCUIT_PDF, "rb") as f:
            r = client.post("/api/tools/protect-pdf/process",
                            files={"file": ("circuit.pdf", f, "application/pdf")},
                            data={"password": "TestPassword123!"})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("protect-pdf (cifrado con contraseña)", test_protect)

    # 7. UNLOCK-PDF
    def test_unlock():
        with open(ASSET_PROTECTED_PDF, "rb") as f:
            r = client.post("/api/tools/unlock-pdf/process",
                            files={"file": ("protected.pdf", f, "application/pdf")},
                            data={"password": "TestPassword123!"})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("unlock-pdf (descifrado con contraseña)", test_unlock)

    # 8. SPLIT-PDF (4 MODES)
    def test_split_range():
        with open(ASSET_EXERCISES_PDF, "rb") as f:
            r = client.post("/api/tools/split-pdf/split",
                            files={"pdf": ("exercises.pdf", f, "application/pdf")},
                            data={"options": json.dumps({"mode": "range", "ranges": [{"from": 1, "to": 2}]})})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("split-pdf (modo: 'range' [1-2])", test_split_range)

    def test_split_pages_merged():
        with open(ASSET_EXERCISES_PDF, "rb") as f:
            r = client.post("/api/tools/split-pdf/split",
                            files={"pdf": ("exercises.pdf", f, "application/pdf")},
                            data={"options": json.dumps({"mode": "pages", "selectedPages": [1, 3], "mergeSelected": True})})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("split-pdf (modo: 'pages' merge=true)", test_split_pages_merged)

    def test_split_pages_zip():
        with open(ASSET_EXERCISES_PDF, "rb") as f:
            r = client.post("/api/tools/split-pdf/split",
                            files={"pdf": ("exercises.pdf", f, "application/pdf")},
                            data={"options": json.dumps({"mode": "pages", "selectedPages": [1, 2], "mergeSelected": False})})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("split-pdf (modo: 'pages' zip [merge=false])", test_split_pages_zip)

    def test_split_size():
        with open(ASSET_EXERCISES_PDF, "rb") as f:
            r = client.post("/api/tools/split-pdf/split",
                            files={"pdf": ("exercises.pdf", f, "application/pdf")},
                            data={"options": json.dumps({"mode": "size", "maxSizeBytes": 1024 * 1024})})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("split-pdf (modo: 'size' [Pro feature])", test_split_size)

    # 9. MERGE-PDF
    def test_merge():
        with open(ASSET_CIRCUIT_PDF, "rb") as f1, open(ASSET_TIMER_PDF, "rb") as f2:
            r = client.post("/api/tools/merge-pdf/merge",
                            files=[("pdfs", ("circuit.pdf", f1, "application/pdf")),
                                   ("pdfs", ("timer.pdf", f2, "application/pdf"))])
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("merge-pdf (unir múltiples PDFs)", test_merge)

    # 10. REMOVE-PDF-PAGES
    def test_remove_pages():
        with open(ASSET_EXERCISES_PDF, "rb") as f:
            r = client.post("/api/tools/remove-pdf-pages/remove",
                            files={"pdf": ("exercises.pdf", f, "application/pdf")},
                            data={"pagesToRemove": json.dumps([2])})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("remove-pdf-pages (eliminar página 2)", test_remove_pages)

    # 11. ORGANIZE-PDF
    def test_organize():
        with open(ASSET_EXERCISES_PDF, "rb") as f:
            pages_order = json.dumps([
                {"pageIndex": 1, "rotation": 0},
                {"pageIndex": 0, "rotation": 90},
                {"pageIndex": 3, "rotation": 0},
            ])
            r = client.post("/api/tools/organize-pdf/organize",
                            files={"pdf": ("exercises.pdf", f, "application/pdf")},
                            data={"pagesOrder": pages_order})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("organize-pdf (reordenar y rotar páginas)", test_organize)

    # 12. ROTATE-PDF
    def test_rotate():
        with open(ASSET_CIRCUIT_PDF, "rb") as f:
            r = client.post("/api/tools/rotate-pdf/process",
                            files={"file": ("circuit.pdf", f, "application/pdf")},
                            data={"options": json.dumps({"globalRotation": 90, "pages": []})})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("rotate-pdf (rotar 90 grados)", test_rotate)

    # 13. PAGE-NUMBERS
    def test_page_numbers():
        with open(ASSET_CIRCUIT_PDF, "rb") as f:
            r = client.post("/api/tools/page-numbers/process",
                            files={"file": ("circuit.pdf", f, "application/pdf")},
                            data={"position": "bottom-right", "format": "{n} de {total}", "startFrom": "1"})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("page-numbers (numerar páginas)", test_page_numbers)

    # 14. WATERMARK-PDF (3 MODES)
    def test_wm_text():
        with open(ASSET_CIRCUIT_PDF, "rb") as f:
            r = client.post("/api/tools/watermark-pdf/process",
                            files={"file": ("circuit.pdf", f, "application/pdf")},
                            data={"options": json.dumps({"type": "text", "text": "CONFIDENCIAL", "fontSize": 40})})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("watermark-pdf (modo: 'text')", test_wm_text)

    def test_wm_mosaic():
        with open(ASSET_CIRCUIT_PDF, "rb") as f:
            r = client.post("/api/tools/watermark-pdf/process",
                            files={"file": ("circuit.pdf", f, "application/pdf")},
                            data={"options": json.dumps({"type": "text", "text": "BORRADOR", "mosaic": True})})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("watermark-pdf (modo: 'mosaic')", test_wm_mosaic)

    def test_wm_image():
        with open(ASSET_CIRCUIT_PDF, "rb") as f1, open(ASSET_IMAGE_JPG, "rb") as f2:
            r = client.post("/api/tools/watermark-pdf/process",
                            files={"file": ("circuit.pdf", f1, "application/pdf"),
                                   "watermarkImage": ("sample.jpg", f2, "image/jpeg")},
                            data={"options": json.dumps({"type": "image"})})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("watermark-pdf (modo: 'image')", test_wm_image)

    # 15. CROP-PDF
    def test_crop():
        with open(ASSET_CIRCUIT_PDF, "rb") as f:
            r = client.post("/api/tools/crop-pdf/process",
                            files={"file": ("circuit.pdf", f, "application/pdf")},
                            data={"options": json.dumps({"cropBox": {"x": 20, "y": 20, "width": 300, "height": 400}})})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("crop-pdf (recortar márgenes de página)", test_crop)

    # 16. REPAIR-PDF
    def test_repair():
        with open(ASSET_CIRCUIT_PDF, "rb") as f:
            r = client.post("/api/tools/repair-pdf/repair",
                            files={"pdf": ("circuit.pdf", f, "application/pdf")})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("repair-pdf (reparar y reconstruir XREF)", test_repair)

    # 17. OCR-PDF
    def test_ocr():
        with open(ASSET_CIRCUIT_PDF, "rb") as f:
            r = client.post("/api/tools/ocr-pdf/process",
                            files={"pdf": ("circuit.pdf", f, "application/pdf")},
                            data={"language": "spa", "outputFormat": "pdf"})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("ocr-pdf (reconocimiento óptico de caracteres)", test_ocr)

    # 18. PDF-TO-MARKDOWN
    def test_markdown():
        with open(ASSET_NEGOCIACION_PDF, "rb") as f:
            r = client.post("/api/tools/pdf-to-markdown/convert",
                            files={"pdf": ("negociacion.pdf", f, "application/pdf")})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("pdf-to-markdown (extracción estructurada a Markdown)", test_markdown)

    # 19. COMPARE-PDF (2 MODES)
    def test_compare_semantic():
        with open(ASSET_CIRCUIT_PDF, "rb") as f1, open(ASSET_TIMER_PDF, "rb") as f2:
            r = client.post("/api/tools/compare-pdf/compare",
                            files={"file1": ("circuit.pdf", f1, "application/pdf"),
                                   "file2": ("timer.pdf", f2, "application/pdf")},
                            data={"comparisonMode": "semantic"})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("compare-pdf (modo: 'semantic')", test_compare_semantic)

    def test_compare_overlay():
        with open(ASSET_CIRCUIT_PDF, "rb") as f1, open(ASSET_TIMER_PDF, "rb") as f2:
            r = client.post("/api/tools/compare-pdf/compare",
                            files={"file1": ("circuit.pdf", f1, "application/pdf"),
                                   "file2": ("timer.pdf", f2, "application/pdf")},
                            data={"comparisonMode": "overlay"})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("compare-pdf (modo: 'overlay')", test_compare_overlay)

    # 20. EDIT-PDF
    def test_edit():
        with open(ASSET_CIRCUIT_PDF, "rb") as f:
            modifications = json.dumps({
                "texts": [{"pageIndex": 0, "text": "QA AUTO TEST", "x": 50, "y": 50, "fontSize": 14, "color": "#000000"}],
                "drawings": [{"pageIndex": 0, "points": [{"x": 10, "y": 10}, {"x": 30, "y": 30}], "color": "#FF0000", "thickness": 2}]
            })
            r = client.post("/api/tools/edit-pdf/process",
                            files={"file": ("circuit.pdf", f, "application/pdf")},
                            data={"modifications": modifications})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("edit-pdf (edición de texto y trazo vectorial)", test_edit)

    # 21. REDACT-PDF
    def test_redact():
        with open(ASSET_CIRCUIT_PDF, "rb") as f:
            redactions = json.dumps([
                {"pageIndex": 0, "boxes": [{"x": 50, "y": 50, "width": 80, "height": 40}], "type": "solid", "color": "#000000"},
                {"pageIndex": 0, "boxes": [{"x": 150, "y": 150, "width": 80, "height": 20}], "type": "strike", "color": "#FF0000"}
            ])
            r = client.post("/api/tools/redact-pdf/redact",
                            files={"pdf": ("circuit.pdf", f, "application/pdf")},
                            data={"redactions": redactions})
            if r.status_code == 200 and r.json().get("success"):
                return True, None
            return False, f"Status: {r.status_code}, Res: {r.text[:120]}"
    test_endpoint("redact-pdf (censura sólida y tachado)", test_redact)

    # 22. CLOUD PROXY SECURITY
    def test_cloud_security():
        r = client.post("/api/tools/cloud/fetch-file",
                        json={"url": "https://malicious-external-site.com/doc.pdf"})
        if r.status_code == 403:
            return True, None
        return False, f"Status: {r.status_code}, Expected: 403"
    test_endpoint("cloud (validación de seguridad whitelist)", test_cloud_security)
