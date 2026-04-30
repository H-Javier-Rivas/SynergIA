/**
 * @module pdf-vision
 * @description Motor de procesamiento de PDFs y análisis con visión de OpenRouter.
 * Utiliza Ghostscript directamente para garantizar compatibilidad en Windows (Node ESM).
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { PDFDocument } from 'pdf-lib';
import { analyzeImageFromBase64 } from './vision-core.js';
import type { VisionTask, VisionResult } from './vision-core.js';
export type { VisionTask, VisionResult };

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface PDFVisionOptions {
  pages?: number[];
  visionTask?: VisionTask;
  userPrompt?: string;
  context?: string;
}

export interface PDFVisionResult {
  pageResults: VisionResult[];
  combinedText: string;
  pagesProcessed: number;
  modelsUsed: string[];
}

// ─── Implementación ───────────────────────────────────────────────────────────

/**
 * Extrae imágenes de un PDF usando Ghostscript directamente.
 * Evita dependencias externas frágiles.
 */
async function extractPDFImagesDirect(pdfPath: string, pageNumbers: number[]): Promise<string[]> {
  const tempDir = path.join(process.cwd(), 'temp', `gs_${Date.now()}`);
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const images: string[] = [];
  // Intentar usar el comando directamente, si falla, intentar con la ruta común en Windows
  const gsCommands = ["gswin64c", "gs", "C:\\Program Files\\gs\\gs10.07.0\\bin\\gswin64c.exe"];

  console.log(`[PDF-Vision] [GS] Procesando ${pdfPath} con Ghostscript...`);

  for (const pageNum of pageNumbers) {
    const outPath = path.join(tempDir, `page_${pageNum}.jpg`);
    let success = false;

    for (const cmd of gsCommands) {
      try {
        const fullCmd = `"${cmd}" -dNOPAUSE -dBATCH -sDEVICE=jpeg -r200 -dFirstPage=${pageNum} -dLastPage=${pageNum} -sOutputFile="${outPath}" "${pdfPath}"`;
        execSync(fullCmd, { stdio: 'ignore' });
        
        if (fs.existsSync(outPath)) {
          const buffer = fs.readFileSync(outPath);
          images.push(`data:image/jpeg;base64,${buffer.toString('base64')}`);
          success = true;
          break; // Salir del loop de comandos si tuvo éxito
        }
      } catch (e) {
        // Ignorar y probar el siguiente comando
      }
    }

    if (!success) {
      console.warn(`[PDF-Vision] [GS] Falló la extracción de la página ${pageNum} con todos los comandos GS.`);
      images.push("");
    }
  }

  // Limpieza
  try {
    const files = fs.readdirSync(tempDir);
    for (const f of files) fs.unlinkSync(path.join(tempDir, f));
    fs.rmdirSync(tempDir);
  } catch (e) {}

  return images;
}

/**
 * Función principal de análisis de PDF.
 */
export async function analyzePDFWithVision(
  pdfPath: string,
  options: PDFVisionOptions = {}
): Promise<PDFVisionResult> {
  const { visionTask = 'document', userPrompt, context = '' } = options;

  try {
    // 1. Obtener info del PDF
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const totalPages = pdfDoc.getPageCount();
    
    // 2. Determinar páginas (límite de seguridad de 10 páginas para no agotar tokens/presupuesto)
    let pagesToProcess = options.pages || Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1);
    
    console.log(`[PDF-Vision] Iniciando análisis de ${pagesToProcess.length} páginas de ${totalPages}`);

    // 3. Extraer imágenes
    const imageDataUrls = await extractPDFImagesDirect(pdfPath, pagesToProcess);
    
    const pageResults: VisionResult[] = [];
    const modelsUsed = new Set<string>();

    // 4. Analizar con visión (secuencial para no saturar rate limits)
    for (let i = 0; i < imageDataUrls.length; i++) {
      const imgData = imageDataUrls[i];
      const pageNum = pagesToProcess[i];

      if (!imgData) {
        pageResults.push({ text: `[Error: No se pudo extraer imagen de página ${pageNum}]`, modelUsed: 'error', wasPaidFallback: false });
        continue;
      }

      const prompt = userPrompt || (visionTask === 'homework' ? 'Analiza y corrige esta tarea de estadística.' : 'Extrae el texto de este documento.');
      const pageContext = `${context} (Página ${pageNum} de ${totalPages})`;

      try {
        const result = await analyzeImageFromBase64(imgData, visionTask, prompt, pageContext);
        pageResults.push(result);
        modelsUsed.add(result.modelUsed);
      } catch (err: any) {
        pageResults.push({ text: `[Error analizando página ${pageNum}: ${err.message}]`, modelUsed: 'vision-error', wasPaidFallback: false });
      }
    }

    const combinedText = pageResults.map((r, i) => `--- Página ${pagesToProcess[i]} ---\n${r.text}`).join('\n\n');

    return {
      pageResults,
      combinedText,
      pagesProcessed: pageResults.length,
      modelsUsed: Array.from(modelsUsed)
    };
  } catch (error: any) {
    console.error('[PDF-Vision] Error crítico:', error);
    throw error;
  }
}

/**
 * Alias para compatibilidad.
 */
export const extractTextFromPDF = analyzePDFWithVision;