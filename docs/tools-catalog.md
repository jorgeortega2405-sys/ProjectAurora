# Catálogo Maestro de Herramientas y Operaciones IA (ProjectAurora)

Este documento contiene el mapeo exhaustivo de todas las herramientas (`tools`), sus parámetros de configuración, opciones de calidad, modos de ejecución de Inteligencia Artificial, costos de créditos, formatos de entrada y compatibilidad con pipelines encadenados para el agente conversacional `/ai`.

---

## 1. Mapeo General de Herramientas

| ID de Herramienta | Nombre | Archivos de Entrada | Parámetros Principales | Opciones de Calidad / Modo | Costo en Créditos IA | Salida | Encadenable |
|---|---|---|---|---|---|---|---|
| `compress-pdf` | Comprimir PDF | 1 PDF (Free) / Hasta 10 (Pro) | `level` | `extreme` (72 dpi), `recommended` (150 dpi), `low` (300 dpi) | 0 créditos | PDF comprimido | Sí |
| `merge-pdf` | Unir PDFs | 2 a 25 PDFs (Free) / Hasta 500 (Pro) | `customFilename` | N/A | 0 créditos | PDF único unido | Sí (inicio) |
| `to-pdf-converter` | Convertir a PDF | Office (.docx, .xlsx, .pptx), Imágenes (.jpg, .png), HTML | `sourceType` | `word-to-pdf`, `excel-to-pdf`, `powerpoint-to-pdf`, `jpg-to-pdf`, `html-to-pdf` | 0 créditos | PDF | Sí (inicio de pipeline) |
| `pdf-converter` | Convertir desde PDF | 1 PDF | `targetType` | `pdf-to-word`, `pdf-to-excel`, `pdf-to-powerpoint`, `pdf-to-jpg`, `pdf-to-pdfa` | 0 créditos | .docx, .xlsx, .pptx, .jpg (ZIP), PDF/A | Sí (terminal) |
| `summarize-pdf` | Resumir PDF con IA | 1 PDF | `mode`, `customPrompt` | `standard` (resumen ejecutivo), `advanced` (análisis profundo) | `standard`: 0 créditos<br>`advanced`: 10 créditos | Markdown estructurado | Sí (terminal o lectura) |
| `translate-pdf` | Traducir PDF | 1 PDF | `targetLang`, `mode` | Idiomas: EN, ES, FR, DE, IT, PT, JA, ZH.<br>Modo: `standard` / `advanced` | `standard`: 0 créditos<br>`advanced`: 10 créditos | PDF traducido | Sí |
| `split-pdf` | Dividir PDF | 1 PDF | `mode`, `ranges`, `selectedPages`, `fixedPageCount`, `mergeSelected` | Modos: `range`, `pages`, `fixed`, `size` | 0 créditos | PDF o ZIP | Sí (si `mergeSelected: true`) |
| `organize-pdf` | Organizar / Reordenar | 1 PDF | `order`, `pagesOrder` | `asc`, `reverse`, orden arbitrario de páginas | 0 créditos | PDF reordenado | Sí |
| `remove-pdf-pages` | Eliminar Páginas | 1 PDF | `pagesToRemove` | Lista de índices de página (1-based) | 0 créditos | PDF sin páginas eliminadas | Sí |
| `rotate-pdf` | Rotar PDF | 1 PDF | `globalRotation`, `pages` | Grados: `90`, `180`, `270` horario | 0 créditos | PDF rotado | Sí |
| `crop-pdf` | Recortar PDF | 1 PDF | `cropBox`, `applyToAll`, `targetPageIndex` | Coordenadas x, y, ancho, alto | 0 créditos | PDF recortado | Sí |
| `watermark-pdf` | Marca de Agua | 1 PDF | `type`, `text`, `position`, `fontSize`, `color`, `opacity`, `rotation`, `image` | Tipo: `text` o `image`.<br>Posiciones: centro, esquinas. Opacidad 0.1 a 1.0 | 0 créditos | PDF con marca de agua | Sí |
| `page-numbers` | Numerar Páginas | 1 PDF | `position`, `format`, `margin`, `startNumber` | Posiciones: 6 ubicaciones.<br>Formatos: `page_n`, `page_n_of_m`, `page_only_n` | 0 créditos | PDF numerado | Sí |
| `protect-pdf` | Proteger PDF | 1 PDF | `password` | Cifrado estándar AES/RC4 con clave de usuario | 0 créditos | PDF encriptado | Sí |
| `unlock-pdf` | Desbloquear PDF | 1 PDF | `password` | Eliminación de protección por clave conocida | 0 créditos | PDF desbloqueado | Sí |
| `ocr-pdf` | OCR y Reconocimiento | 1 PDF | `language`, `deskew` | Idiomas: `spa`, `eng`, `fra`, `deu`, `ita`, `por`.<br>Deskew: auto-corrección de inclinación | 0 créditos | PDF con capa de texto buscable | Sí |
| `repair-pdf` | Reparar PDF | 1 PDF | N/A | Reconstrucción de tabla XREF y streams dañados | 0 créditos | PDF reparado | Sí |
| `redact-pdf` | Censurar / Redactar | 1 PDF | `redactions`, `sanitizeMetadata` | Zonas de exclusión opaca y eliminación de metadatos | 0 créditos | PDF censurado | Sí |
| `pdf-to-markdown` | PDF a Markdown | 1 PDF | `mode` | `structured`, `plain` | 0 créditos | Archivo Markdown (.md) | Sí (terminal) |
| `compare-pdf` | Comparar PDFs | 2 PDFs | N/A | Detección visual y textual de diferencias | 0 créditos | Reporte de diferencias | No (operación interactiva) |
| `edit-pdf` | Editor PDF Interactivo | 1 PDF | Anotaciones, trazos | Capas vectoriales y de texto | 0 créditos | PDF editado | Standalone |

---

## 2. Detalle Exhaustivo por Herramienta

### 2.1. Comprimir PDF (`compress-pdf`)
- **Descripción**: Reduce el peso del archivo optimizando imágenes incrustadas, fuentes y estructuras de streams.
- **Niveles de Calidad / Compresión (`level`)**:
  - `extreme` (Compresión Extrema):
    - Resolución objetivo: **72 DPI** (configuración Ghostscript `/screen`).
    - Máxima reducción de peso (típicamente 60% a 85% de reducción).
    - Recomendado cuando el usuario solicita "lo más comprimido posible", "bajar peso al mínimo para email o WhatsApp", o "calidad baja / rápida".
  - `recommended` (Compresión Recomendada - Predeterminada):
    - Resolución objetivo: **150 DPI** (configuración Ghostscript `/ebook`).
    - Equilibrio óptimo entre legibilidad de textos, nitidez de gráficos y peso ligero (40% a 65% de reducción).
    - Es la opción predeterminada cuando el usuario dice simplemente "comprime este pdf".
  - `low` (Baja Compresión / Alta Calidad):
    - Resolución objetivo: **300 DPI** (configuración Ghostscript `/printer`).
    - Mantiene alta fidelidad fotográfica y nitidez para impresión profesional reduciendo únicamente redundancias.
    - Indicado cuando el usuario solicita "comprimir sin perder calidad", "para impresión" o "calidad alta".
- **Límites de tamaño**:
  - Plan Free: hasta 100 MB por archivo.
  - Plan Pro/Enterprise: hasta 1000 MB por archivo.

### 2.2. Unir PDFs (`merge-pdf`)
- **Descripción**: Fusiona dos o más documentos PDF en un único archivo respetando el orden especificado.
- **Parámetros**:
  - `files`: Lista ordenada de documentos PDF.
  - `customFilename`: Nombre opcional para el archivo final unificado (por defecto `documento_unido.pdf`).
- **Límites**:
  - Free: hasta 25 archivos simultáneos, máximo 100 MB total.
  - Pro/Enterprise: hasta 500 archivos simultáneos, máximo 2000 MB total.

### 2.3. Conversor hacia PDF (`to-pdf-converter`)
- **Descripción**: Transforma documentos ofimáticos o imágenes en archivos PDF estándar listos para archivar o procesar.
- **Tipos de Origen (`sourceType`)**:
  - `word-to-pdf`: Documentos Microsoft Word (`.docx`, `.doc`). Utiliza LibreOffice headless con motor de tipografía nativo.
  - `excel-to-pdf`: Hojas de cálculo Microsoft Excel (`.xlsx`, `.xls`). Convierte cuadrículas y hojas tabulares.
  - `powerpoint-to-pdf`: Presentaciones Microsoft PowerPoint (`.pptx`, `.ppt`).
  - `jpg-to-pdf`: Imágenes en mapa de bits (`.jpg`, `.jpeg`, `.png`). Procesa con `img2pdf` sin pérdida y fallback PIL manteniendo resolución original.
  - `html-to-pdf`: Archivos o fragmentos HTML con estilos web (`.html`, `.htm`).
- **Límites**: Free hasta 50 MB; Pro hasta 500 MB.

### 2.4. Conversor desde PDF (`pdf-converter`)
- **Descripción**: Extrae y reconvierte el contenido de un documento PDF hacia formatos editables o imágenes.
- **Tipos de Destino (`targetType`)**:
  - `pdf-to-word`: Convierte a documento Word editable (`.docx`).
  - `pdf-to-excel`: Extrae tablas detectadas a libro Excel (`.xlsx`).
  - `pdf-to-powerpoint`: Convierte diapositivas a presentación PowerPoint (`.pptx`).
  - `pdf-to-jpg`: Renderiza cada página como imagen JPEG alta resolución a 150/300 DPI. Si hay múltiples páginas, genera un archivo comprimido `.zip`.
  - `pdf-to-pdfa`: Convierte a estándar de preservación a largo plazo PDF/A-1b.
- **Límites**: Free 50 MB; Pro 500 MB.

### 2.5. Resumir PDF con IA (`summarize-pdf`)
- **Descripción**: Extrae el contenido textual del PDF y utiliza el motor de IA de ProjectAurora para producir análisis ejecutivos o profundos.
- **Modos de Resumen (`mode`) y Costos**:
  - `standard` (Resumen General Estándar):
    - **Costo**: **0 créditos** (Gratuito para todos los usuarios).
    - Estructura: Visión general ejecutiva (2 a 3 párrafos), Puntos clave y hallazgos destacados (5 a 8 viñetas), Conclusiones directas.
    - Motor: Inteligencia artificial estándar de alta velocidad.
  - `advanced` (Análisis Avanzado Exhaustivo):
    - **Costo**: **10 créditos de IA** (`AI_CREDIT_COSTS.advancedSummarize`). Requiere cuenta Pro o Empresas con saldo de créditos activo.
    - Estructura: Contexto, objetivos y alcance; Desglose temático y secciones principales; Datos clave, estadísticas y métricas; Hallazgos críticos, impacto y riesgos; Recomendaciones ejecutivas y plan de acción.
    - Motor: Inteligencia artificial avanzada con profundidad analítica expandida.
- **Parámetro adicional `customPrompt`**: Permite al usuario indicar un foco específico (ej. "Enfócate en los aspectos financieros", "Explica las implicaciones legales para una pyme").

### 2.6. Traducir PDF (`translate-pdf`)
- **Descripción**: Traduce el contenido textual del PDF a otro idioma preservando en lo posible la maquetación.
- **Idiomas soportados (`targetLang`)**:
  - `EN` (Inglés), `ES` (Español), `FR` (Francés), `DE` (Alemán), `IT` (Italiano), `PT` (Portugués), `JA` (Japonés), `ZH` (Chino simplificado).
- **Modos y Costos**:
  - `standard`: 0 créditos (hasta cuota base).
  - `advanced`: 10 créditos de IA (`AI_CREDIT_COSTS.advancedTranslate`).

### 2.7. Dividir PDF (`split-pdf`)
- **Descripción**: Fragmenta un PDF en varios documentos o extrae un conjunto de páginas específico.
- **Modos (`mode`)**:
  - `range`: Rango de páginas continuo o discontinuo (ej. `"1-3, 5-8"`).
  - `pages`: Extracción de páginas específicas (`selectedPages: [1, 4, 7]`). Si `mergeSelected: true`, las fusiona en un único PDF resultante; si es `false`, genera un `.zip` con un archivo por página.
  - `fixed`: Divide cada $N$ páginas (`fixedPageCount: 2`).
  - `size`: Divide por tamaño máximo de archivo en bytes (`maxSizeBytes`).

### 2.8. Organizar PDF (`organize-pdf`)
- **Descripción**: Reordena, invierte o rota páginas individuales dentro del documento.
- **Parámetros**:
  - `order`: `'asc'` o `'reverse'`.
  - `pagesOrder`: Array de objetos `{ pageIndex: number, rotation?: number }` que define la nueva secuencia exacta.

### 2.9. Eliminar Páginas (`remove-pdf-pages`)
- **Descripción**: Elimina las páginas indicadas por su número secuencial (base 1).
- **Parámetro**: `pagesToRemove: number[]` (ej. `[2, 4, 5]`).

### 2.10. Rotar PDF (`rotate-pdf`)
- **Descripción**: Rota páginas en sentido horario en incrementos ortogonales.
- **Parámetros**:
  - `globalRotation`: `90` (horizontal/derecha), `180` (invertido), `270` (horizontal/izquierda).
  - `pages`: Opcional para especificar páginas individuales.

### 2.11. Marca de Agua (`watermark-pdf`)
- **Descripción**: Inserta marcas de agua textuales o gráficas en todas las páginas.
- **Parámetros**:
  - `type`: `'text'` o `'image'`.
  - `text`: Texto (ej. `"CONFIDENCIAL"`, `"COPIA NO OFICIAL"`).
  - `position`: `'center'`, `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'`, `'top-center'`, `'bottom-center'`.
  - `opacity`: Valor entre `0.1` y `1.0` (por defecto `0.3`).
  - `rotation`: Grados de inclinación (por defecto `45` grados para diagonal).
  - `color`: Código hexadecimal (por defecto `#FF0000`).

### 2.12. Numerar Páginas (`page-numbers`)
- **Descripción**: Estampa foliado automático en las páginas.
- **Parámetros**:
  - `position`: `'bottom-center'`, `'bottom-right'`, `'bottom-left'`, `'top-center'`, `'top-right'`, `'top-left'`.
  - `format`:
    - `page_n`: "1, 2, 3..."
    - `page_n_of_m`: "Página 1 de 15..."
    - `page_only_n`: "Pág. 1..."
  - `startNumber`: Número inicial (por defecto `1`).
  - `margin`: Margen en puntos (por defecto `20`).

### 2.13. Proteger PDF (`protect-pdf`)
- **Descripción**: Encripta el documento PDF con una contraseña de apertura mediante cifrado seguro.
- **Parámetros**: `password: string` (contraseña requerida).

### 2.14. Desbloquear PDF (`unlock-pdf`)
- **Descripción**: Elimina las restricciones de apertura o permisos de impresión de un documento PDF conociendo su contraseña previa.
- **Parámetros**: `password: string`.

### 2.15. OCR PDF (`ocr-pdf`)
- **Descripción**: Aplica reconocimiento óptico de caracteres mediante Tesseract para transformar documentos escaneados o imágenes PDF en documentos con texto seleccionable, copiable y buscable.
- **Parámetros**:
  - `language`: `'spa'` (Español), `'eng'` (Inglés), `'fra'` (Francés), `'deu'` (Alemán), `'ita'` (Italiano), `'por'` (Portugués).
  - `deskew`: `true` (enderezar automáticamente páginas torcidas).

### 2.16. Reparar PDF (`repair-pdf`)
- **Descripción**: Repara estructuras de árbol corruptas, tablas de referencias cruzadas rotas o delimitadores truncados con Ghostscript y pdf-lib.

### 2.17. Censurar PDF (`redact-pdf`)
- **Descripción**: Censura de forma permanente e irrecuperable bloques rectangulares o textos sensibles, eliminando el texto subyacente y los metadatos.
- **Parámetros**:
  - `redactions`: Lista de rectángulos con índice de página.
  - `sanitizeMetadata`: `true` para limpiar autor, título y creador.

### 2.18. PDF a Markdown (`pdf-to-markdown`)
- **Descripción**: Convierte la estructura de párrafos, encabezados y tablas del PDF a sintaxis Markdown limpia (`.md`).
- **Modos**: `structured` (reconoce jerarquía semántica) o `plain` (texto plano).

---

## 3. Matriz de Encadenamiento de Acciones en Chat IA

El Chat IA `/ai` permite ordenar comandos compuestos en lenguaje natural, por ejemplo:
- *"Uneme estos 2 pdf y luego comprime"* -> `merge-pdf` $\rightarrow$ `compress-pdf`
- *"Pásame este Word a PDF y luego comprímelo"* -> `word-to-pdf` $\rightarrow$ `compress-pdf`
- *"Pásame este Excel a PDF"* -> `excel-to-pdf`
- *"Elimina la página 1 de este PDF y ponle marca de agua CONFIDENCIAL"* -> `remove-pdf-pages` $\rightarrow$ `watermark-pdf`
- *"Rota este PDF 90 grados y numera las páginas"* -> `rotate-pdf` $\rightarrow$ `page-numbers`
- *"Repara este PDF y luego resúmelo"* -> `repair-pdf` $\rightarrow$ `summarize-pdf`

### Reglas de Ejecución Secuencial:
1. **Entrada heterogénea a PDF**: Si el archivo de entrada es un documento Office (`.docx`, `.xlsx`, `.pptx`) o imagen (`.jpg`, `.png`), se ejecuta primero de manera automática `to-pdf-converter`.
2. **Entrada de múltiples archivos**: Si el usuario proporciona 2 o más archivos y solicita unirlos o combinarlos, se inicia con `merge-pdf`.
3. **Paso Intermedio**: Cualquier transformación sobre PDF (`compress-pdf`, `rotate-pdf`, `watermark-pdf`, `remove-pdf-pages`, `page-numbers`, `protect-pdf`, etc.) consume el PDF del paso previo y genera un nuevo PDF intermedio.
4. **Paso Terminal**: Las herramientas como `pdf-converter` (PDF a Word, Excel, JPG), `pdf-to-markdown` o `summarize-pdf` producen resultados finales no PDF o resúmenes en texto y concluyen el pipeline.
