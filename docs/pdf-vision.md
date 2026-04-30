# Módulo PDF-Vision

Este módulo proporciona funcionalidad para convertir archivos PDF a imágenes y analizarlos con la API de visión de OpenRouter.

## Características principales

- Convierte páginas de PDF a imágenes utilizando la librería `pdf-img-convert`
- Analiza las imágenes generadas con la API de visión de OpenRouter
- Opciones flexibles para personalizar el proceso de conversión y análisis
- Soporta análisis de páginas específicas o del documento completo
- Extrae texto e información de PDFs escaneados mediante OCR avanzado

## Requisitos

- Node.js v14 o superior
- La API key de OpenRouter configurada en las variables de entorno (`OPENROUTER_API_KEY`)

## Instalación

La librería `pdf-img-convert` se instala automáticamente cuando se ejecuta la función por primera vez, pero también puedes instalarla manualmente:

```bash
npm install pdf-img-convert
```

## API

### `analyzePDFWithVision(pdfPath, options)`

Convierte un PDF a imágenes y analiza cada página con la API de visión de OpenRouter.

#### Parámetros

- `pdfPath` (string): Ruta al archivo PDF a analizar
- `options` (PDFVisionOptions): Opciones de configuración

```typescript
interface PDFVisionOptions {
  /** Páginas específicas a analizar (1-based). Por defecto: todas */
  pages?: number[];
  /** Calidad de imagen DPI. Por defecto: 150 */
  dpi?: number;
  /** Directorio temporal para guardar imágenes. Por defecto: ./temp */
  tempDir?: string;
  /** Tipo de tarea de visión. Por defecto: 'document' */
  visionTask?: VisionTask;
  /** Prompt adicional para el modelo de visión */
  userPrompt?: string;
  /** Contexto adicional para el modelo de visión */
  context?: string;
  /** Si es true, retiene las imágenes temporales. Por defecto: false */
  keepTempFiles?: boolean;
}
```

#### Valor de retorno

Devuelve una promesa que resuelve a un objeto `PDFVisionResult`:

```typescript
interface PDFVisionResult {
  /** Resultados de análisis por página */
  pageResults: VisionResult[];
  /** Texto combinado de todas las páginas */
  combinedText: string;
  /** Número total de páginas procesadas */
  pagesProcessed: number;
  /** Lista de modelos utilizados en el análisis */
  modelsUsed: string[];
}
```

### `extractTextFromPDF(pdfPath, options)`

Función especializada para extraer texto de un PDF escaneado o con imágenes mediante OCR. Es un wrapper sobre `analyzePDFWithVision` con la tarea `document`.

#### Parámetros

- `pdfPath` (string): Ruta al archivo PDF
- `options` (Omit<PDFVisionOptions, 'visionTask'>): Opciones excluyendo el tipo de tarea (siempre es 'document')

#### Valor de retorno

Devuelve una promesa que resuelve a un objeto `PDFVisionResult` (mismo formato que `analyzePDFWithVision`).

## Ejemplos de uso

### Análisis general de un PDF

```typescript
import { analyzePDFWithVision } from './agent/pdf-vision.js';

async function analyzeMyPDF() {
  const result = await analyzePDFWithVision('path/to/document.pdf', {
    pages: [1, 2, 3], // Solo analizar páginas específicas
    dpi: 200, // Mejor calidad para mejor precisión
    visionTask: 'general',
    userPrompt: 'Describe detalladamente el contenido de esta página',
    context: 'Este documento es un informe científico',
  });
  
  console.log(`Páginas procesadas: ${result.pagesProcessed}`);
  console.log(`Texto extraído: ${result.combinedText}`);
}
```

### Extracción de texto de un PDF escaneado

```typescript
import { extractTextFromPDF } from './agent/pdf-vision.js';

async function extractTextFromScan() {
  const result = await extractTextFromPDF('path/to/scanned-document.pdf', {
    dpi: 300, // Alta resolución para mejor OCR
    context: 'Este documento es un contrato escaneado',
  });
  
  console.log(`Texto extraído: ${result.combinedText}`);
}
```

## Consideraciones

- La conversión de PDF a imágenes puede consumir recursos significativos para documentos grandes
- Los archivos de imagen temporal se almacenan en el directorio especificado (`tempDir`)
- La API de OpenRouter puede generar costos según el modelo utilizado y el volumen de imágenes
- Usar la opción `keepTempFiles: true` para depuración si se necesita inspeccionar las imágenes generadas