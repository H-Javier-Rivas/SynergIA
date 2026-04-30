/**
 * @module vision-core
 * @description Lógica robusta para análisis de visión con fallbacks de pago.
 */

import { config } from '../config/index.js';
import { GoogleGenerativeAI } from "@google/generative-ai";

export type VisionTask = 'homework' | 'document' | 'general';

export interface VisionResult {
  text: string;
  modelUsed: string;
  wasPaidFallback: boolean;
}

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const PRIMARY_MODEL = 'google/gemini-2.0-flash-001';
const SECONDARY_MODEL = 'google/gemini-2.0-flash-lite-001';

const genAI = config.GEMINI_API_KEY ? new GoogleGenerativeAI(config.GEMINI_API_KEY) : null;

/**
 * Analiza una imagen con estrategia de pago robusta.
 */
export async function analyzeImageFromBase64(
  imageDataUrl: string,
  task: VisionTask,
  userPrompt: string,
  context: string = ''
): Promise<VisionResult> {
  const systemPrompt = buildSystemPrompt(task, context);
  const paidKey = config.OPENROUTER_API_KEY_PAID || config.OPENROUTER_API_KEY;

  // --- PASO 1: Gemini Directo (Google AI Studio - GRATIS) ---
  if (genAI && imageDataUrl.startsWith('data:image/')) {
    try {
      console.log(`[Vision-Core] Intentando procesar con Gemini Directo (Gratis)...`);
      const base64Data = imageDataUrl.split(',')[1];
      const mimeType = imageDataUrl.split(';')[0].split(':')[1];
      
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent([
        systemPrompt + "\n\n" + userPrompt,
        { inlineData: { data: base64Data, mimeType } }
      ]);
      
      return { text: result.response.text(), modelUsed: "gemini-1.5-flash-direct", wasPaidFallback: false };
    } catch (geminiErr: any) {
      console.warn(`[Vision-Core] Falló Gemini Directo (posible límite de cuota): ${geminiErr.message}. Intentando fallback pagado...`);
    }
  }

  // --- PASO 2: Gemini 2.0 Flash (OpenRouter Paid - Económico) ---
  try {
    console.log(`[Vision-Core] Intentando fallback a OpenRouter ${PRIMARY_MODEL}...`);
    const text = await callOpenRouterVision(PRIMARY_MODEL, imageDataUrl, userPrompt, systemPrompt, paidKey!);
    return { text, modelUsed: PRIMARY_MODEL, wasPaidFallback: true };
  } catch (err: any) {
    console.warn(`[Vision-Core] Falló Gemini OpenRouter: ${err.message}. Intentando último fallback...`);

    // --- PASO 3: Gemini Flash Lite (OpenRouter Paid - Muy Económico) ---
    try {
      console.log(`[Vision-Core] Intentando fallback a ${SECONDARY_MODEL}...`);
      const text = await callOpenRouterVision(SECONDARY_MODEL, imageDataUrl, userPrompt, systemPrompt, paidKey!);
      return { text, modelUsed: SECONDARY_MODEL, wasPaidFallback: true };
    } catch (liteErr: any) {
      console.error(`[Vision-Core] Falló Flash Lite OpenRouter: ${liteErr.message}`);
    }
  }

  throw new Error('No se pudo analizar la imagen. Todos los servicios de visión están saturados.');
}

async function callOpenRouterVision(model: string, imageDataUrl: string, userPrompt: string, systemPrompt: string, apiKey: string): Promise<string> {
  const payload = {
    model,
    max_tokens: 4000,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUrl } },
          { type: 'text', text: userPrompt },
        ],
      },
    ],
  };

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json() as any;
  if (data.error) throw new Error(data.error.message || 'Error');
  return data.choices?.[0]?.message?.content || "";
}

function buildSystemPrompt(task: VisionTask, extraContext: string): string {
  const base = `Eres ${config.BOT_NAME}, un asistente académico experto.\nUsa SOLO etiquetas HTML (<b>, <i>, <code>). NUNCA Markdown.\n`;
  const prompts: Record<VisionTask, string> = {
    homework: `${base}Analiza la tarea de estadística y da retroalimentación pedagógica.\nContexto: ${extraContext}`,
    document: `${base}Extrae TODO el texto con alta fidelidad.\nContexto: ${extraContext}`,
    general: `${base}Analiza la imagen de forma profesional.\nContexto: ${extraContext}`,
  };
  return prompts[task];
}
