/**
 * @module vision
 * @description Motor de análisis de imágenes con modelos multimodales vía OpenRouter.
 * Especializado en archivos de imagen individuales.
 */

import fs from 'fs';
import path from 'path';
import { analyzeImageFromBase64 } from './vision-core.js';
import type { VisionTask, VisionResult } from './vision-core.js';
export type { VisionTask, VisionResult };

/**
 * Detecta el MIME type a partir de la extensión del archivo.
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png':  'image/png',
    '.webp': 'image/webp',
    '.gif':  'image/gif',
  };
  return mimeMap[ext] ?? 'image/jpeg';
}

/**
 * Convierte un archivo de imagen local a una data URL en base64.
 */
function imageToDataUrl(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  const mime = getMimeType(filePath);
  return `data:${mime};base64,${base64}`;
}

/**
 * Analiza una imagen con estrategia free-first, paid-fallback.
 */
export async function analyzeImage(
  imagePath: string,
  task: VisionTask = 'general',
  userPrompt: string = 'Analiza esta imagen.',
  context: string = ''
): Promise<VisionResult> {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Archivo de imagen no encontrado: ${imagePath}`);
  }

  // Si por error se pasa un PDF aquí, redirigir o avisar (mejor manejarlo en pdf-vision.ts)
  if (imagePath.toLowerCase().endsWith('.pdf')) {
    throw new Error('Para procesar PDFs usa analyzePDFWithVision de pdf-vision.ts');
  }

  const imageDataUrl = imageToDataUrl(imagePath);
  return analyzeImageFromBase64(imageDataUrl, task, userPrompt, context);
}

export async function analyzeHomework(imagePath: string, context: string = '') {
    return analyzeImage(imagePath, 'homework', 'Analiza esta tarea.', context);
}

export async function extractTextFromImage(imagePath: string, context: string = '') {
    return analyzeImage(imagePath, 'document', 'Extrae el texto.', context);
}
