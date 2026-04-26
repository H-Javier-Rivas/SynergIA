/**
 * @module vision
 * @description Motor de análisis de imágenes con modelos multimodales vía OpenRouter.
 * Estrategia: modelos gratuitos primero, fallback a modelos de pago del saldo del usuario.
 * Compatible con cualquier bot del ecosistema SynergIA.
 */

import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';

// ─── Configuración de modelos ────────────────────────────────────────────────

/** Modelos gratuitos con capacidad de visión (en orden de preferencia) */
const FREE_VISION_MODELS = [
  'google/gemma-3-27b-it:free',
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'qwen/qwen2-vl-7b-instruct:free',
];

/** Modelos de pago como último recurso (mismos modelos sin :free — ~$0.0003/imagen) */
const PAID_VISION_MODELS = [
  'google/gemma-3-27b-it',
  'meta-llama/llama-3.2-11b-vision-instruct',
];

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type VisionTask = 'homework' | 'document' | 'general';

export interface VisionResult {
  text: string;
  modelUsed: string;
  wasPaidFallback: boolean;
}

// ─── Utilidades internas ─────────────────────────────────────────────────────

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
 * Construye el system prompt según la tarea de visión requerida.
 */
function buildSystemPrompt(task: VisionTask, extraContext: string): string {
  const base = `Eres ${config.BOT_NAME}, un asistente académico experto.\n`;
  const formatRule = `Usa SOLO etiquetas HTML soportadas por Telegram (<b>, <i>, <code>, <pre>). NUNCA uses Markdown.\n`;

  const taskPrompts: Record<VisionTask, string> = {
    homework: `${base}${formatRule}El alumno ha enviado una imagen de su trabajo académico.\n` +
      `Analiza el contenido con detalle, identifica errores conceptuales o de procedimiento ` +
      `y proporciona retroalimentación pedagógica constructiva.\n` +
      `Si hay fórmulas matemáticas, explícalas. Sé preciso pero alentador.\n` +
      (extraContext ? `\nContexto de la asignación: ${extraContext}` : ''),

    document: `${base}${formatRule}Estás analizando una imagen de un documento académico o libro de texto.\n` +
      `Extrae TODO el texto visible con la mayor fidelidad posible.\n` +
      `Si hay fórmulas matemáticas, escríbelas en formato legible.\n` +
      `Si hay tablas o diagramas, descríbelos estructuradamente.\n` +
      (extraContext ? `\nContexto adicional: ${extraContext}` : ''),

    general: `${base}${formatRule}Analiza la imagen enviada y responde de forma útil y precisa.\n` +
      (extraContext ? `\nInstrucción adicional: ${extraContext}` : ''),
  };

  return taskPrompts[task];
}

// ─── Función principal de llamada al modelo ───────────────────────────────────

/**
 * Realiza una llamada a un modelo de visión específico en OpenRouter.
 * @throws Error si el modelo devuelve un error de API.
 */
async function callVisionModel(
  model: string,
  imageDataUrl: string,
  userPrompt: string,
  systemPrompt: string,
  maxTokens: number = 2048
): Promise<string> {
  if (!config.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY no configurada.');
  }

  const payload = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUrl } },
          { type: 'text',      text: userPrompt },
        ],
      },
    ],
  };

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json() as any;

  if (data.error) {
    const code    = data.error.code ?? response.status;
    const message = data.error.message ?? 'Error desconocido';
    throw Object.assign(new Error(`[${model}] API Error ${code}: ${message}`), { code });
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`[${model}] Respuesta vacía del modelo.`);
  }

  return content;
}

// ─── API pública del módulo ───────────────────────────────────────────────────

/**
 * Analiza una imagen con estrategia free-first, paid-fallback.
 *
 * @param imagePath - Ruta local al archivo de imagen.
 * @param task      - Tipo de tarea: 'homework' | 'document' | 'general'.
 * @param userPrompt - Instrucción adicional del usuario (ej: "¿Está bien el cálculo?").
 * @param context   - Contexto extra para enriquecer el system prompt.
 * @returns VisionResult con el texto analizado, modelo usado y si hubo fallback de pago.
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

  const imageDataUrl  = imageToDataUrl(imagePath);
  const systemPrompt  = buildSystemPrompt(task, context);
  const maxTokens     = task === 'document' ? 4096 : 2048;
  const allFreeModels = [...FREE_VISION_MODELS];
  const allPaidModels = [...PAID_VISION_MODELS];

  // ── Paso 1: Intentar con modelos gratuitos ────────────────────────────────
  for (const model of allFreeModels) {
    try {
      console.log(`[Vision] Intentando modelo gratuito: ${model}`);
      const text = await callVisionModel(model, imageDataUrl, userPrompt, systemPrompt, maxTokens);
      console.log(`[Vision] ✅ Éxito con modelo gratuito: ${model}`);
      return { text, modelUsed: model, wasPaidFallback: false };
    } catch (err: any) {
      const isRetryable = [429, 503, 404, 400].includes(err.code ?? 0) ||
        err.message.includes('rate') ||
        err.message.includes('quota') ||
        err.message.includes('unavailable');

      if (isRetryable) {
        console.warn(`[Vision] ⚠️ Modelo ${model} no disponible (${err.message}). Siguiente...`);
        continue;
      }
      // Error no recuperable (ej: imagen corrupta)
      throw err;
    }
  }

  // ── Paso 2: Fallback a modelos de pago ────────────────────────────────────
  if (!config.OPENROUTER_API_KEY) {
    throw new Error('Todos los modelos gratuitos fallaron y no hay API key de pago configurada.');
  }

  console.warn('[Vision] ⚠️ Todos los modelos gratuitos fallaron. Usando fallback de pago...');

  for (const model of allPaidModels) {
    try {
      console.log(`[Vision] Intentando modelo de pago: ${model}`);
      const text = await callVisionModel(model, imageDataUrl, userPrompt, systemPrompt, maxTokens);
      console.log(`[Vision] ✅ Éxito con fallback de pago: ${model}`);
      return { text, modelUsed: model, wasPaidFallback: true };
    } catch (err: any) {
      console.error(`[Vision] ❌ Fallback de pago ${model} falló:`, err.message);
    }
  }

  throw new Error('No se pudo analizar la imagen. Todos los modelos de visión fallaron.');
}

/**
 * Analiza una imagen de tarea enviada por un alumno.
 * Wrapper semántico sobre analyzeImage con task='homework'.
 */
export async function analyzeHomework(
  imagePath: string,
  assignmentContext: string = ''
): Promise<VisionResult> {
  return analyzeImage(
    imagePath,
    'homework',
    '¿Puedes analizar y corregir este trabajo académico con retroalimentación pedagógica?',
    assignmentContext
  );
}

/**
 * Extrae texto/contenido de una imagen de documento o bibliografía.
 * Wrapper semántico sobre analyzeImage con task='document'.
 */
export async function extractTextFromImage(
  imagePath: string,
  context: string = ''
): Promise<VisionResult> {
  return analyzeImage(
    imagePath,
    'document',
    'Extrae todo el texto e información visible en esta imagen con la mayor fidelidad posible.',
    context
  );
}
