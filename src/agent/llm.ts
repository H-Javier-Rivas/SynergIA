import { config } from '../config/index.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const PRIMARY_MODEL = 'google/gemini-2.0-flash-001';
const SECONDARY_MODEL = 'google/gemini-2.0-flash-lite-001';

// Inicializar clientes
const genAI = config.GEMINI_API_KEY ? new GoogleGenerativeAI(config.GEMINI_API_KEY) : null;
// No forzamos apiVersion aquí, dejaremos que el SDK decida pero usaremos nombres de modelos estándar.
const groq = config.GROQ_API_KEY ? new Groq({ apiKey: config.GROQ_API_KEY }) : null;

/**
 * Motor de completado de chat robusto.
 * Estrategia: Gemini Directo (Flash/Pro) -> Groq (Llama 3.3) -> OpenRouter
 */
export async function chatCompletion(messages: any[], tools: any[] = []) {
  const paidKey = config.OPENROUTER_API_KEY_PAID || config.OPENROUTER_API_KEY;

  // --- PASO 1: Gemini Directo (Google AI Studio) ---
  if (genAI) {
    const geminiModels = ["gemini-1.5-flash", "gemini-1.5-pro"];
    for (const modelName of geminiModels) {
      try {
        console.log(`[LLM] Intentando Gemini Directo (${modelName})...`);
        return await callGeminiDirect(modelName, messages, tools);
      } catch (geminiErr: any) {
        console.warn(`[LLM] Falló Gemini Directo (${modelName}): ${geminiErr.message}`);
        // Si es un error de cuota o región, seguimos al siguiente modelo o proveedor
      }
    }
  }

  // --- PASO 2: Groq (Llama 3.3 70B - Rápido y Gratis, pero bloqueado en algunas regiones) ---
  if (groq) {
    try {
      console.log(`[LLM] Intentando fallback a Groq (llama-3.3-70b-versatile)...`);
      return await callGroq(messages, tools);
    } catch (groqErr: any) {
      console.warn(`[LLM] Falló Groq: ${groqErr.message}`);
    }
  }

  // --- PASO 3: OpenRouter ---
  if (paidKey) {
    const models = [PRIMARY_MODEL, SECONDARY_MODEL, "deepseek/deepseek-chat"];
    for (const model of models) {
        try {
            console.log(`[LLM] Intentando fallback a OpenRouter ${model}...`);
            return await callOpenRouter(model, messages, tools, paidKey);
        } catch (err: any) {
            console.warn(`[LLM] Falló OpenRouter ${model}: ${err.message}`);
        }
    }
  }

  throw new Error('Todos los proveedores de IA están saturados. Por favor, reintenta en un momento.');
}

async function callGroq(messages: any[], tools: any[]) {
  const sanitizedHistory = messages.map(msg => ({
    role: msg.role,
    content: msg.content || "",
    ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
    ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
    ...(msg.name && { name: msg.name })
  }));

  const payload: any = {
    messages: sanitizedHistory,
    model: "llama-3.3-70b-versatile",
    max_tokens: 4000
  };
  
  if (tools && tools.length > 0) {
      payload.tools = tools;
  }

  const chatCompletion = await groq!.chat.completions.create(payload);
  return chatCompletion.choices[0]?.message;
}

async function callOpenRouter(model: string, messages: any[], tools: any[], apiKey: string) {
  const sanitizedHistory = messages.map(msg => ({
    role: msg.role,
    content: msg.content || "",
    ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
    ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
    ...(msg.name && { name: msg.name })
  }));

  const payload: any = { 
    model, 
    messages: sanitizedHistory,
    max_tokens: 4000
  };
  if (tools.length > 0) payload.tools = tools;

  console.log(`[LLM] Enviando ${tools.length} herramientas a OpenRouter (${model})...`);

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'SynergIA Professional',
      'HTTP-Referer': 'https://github.com/H-Javier-Rivas/SynergIA'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`[OpenRouter ${model}] ${data.error.message || 'Error'}`);
  }
  return data.choices?.[0]?.message;
}

async function callGeminiDirect(modelName: string, messages: any[], tools: any[]) {
  const systemInstruction = messages.find(m => m.role === 'system')?.content;
  
  // Mapear herramientas al formato de Gemini
  const geminiTools = tools.length > 0 ? [{
    functionDeclarations: tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters
    }))
  }] : undefined;

  // Intentar con nombre limpio (el SDK suele preferir gemini-1.5-flash sin prefijo models/)
  const model = genAI!.getGenerativeModel({ 
    model: modelName, 
    systemInstruction,
    tools: geminiTools as any
  });

  // Convertir historial a formato Gemini (incluyendo resultados de herramientas previas)
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => {
      const parts: any[] = [];
      if (m.content) parts.push({ text: m.content });
      
      if (m.tool_calls) {
        m.tool_calls.forEach((tc: any) => {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments || '{}')
            }
          });
        });
      }

      if (m.role === 'tool') {
        return {
          role: 'function',
          parts: [{
            functionResponse: {
              name: m.name || 'unknown',
              response: { result: m.content }
            }
          }]
        };
      }

      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts
      };
    });

  const result = await model.generateContent({ contents });
  const response = result.response;
  const candidate = response.candidates?.[0];
  const functionCalls = candidate?.content.parts.filter(p => p.functionCall);

  if (functionCalls && functionCalls.length > 0) {
    return {
      role: 'assistant',
      content: null,
      tool_calls: functionCalls.map((fc, index) => ({
        id: `call_${Date.now()}_${index}`,
        type: 'function',
        function: {
          name: fc.functionCall!.name,
          arguments: JSON.stringify(fc.functionCall!.args)
        }
      }))
    };
  }
  
  return {
    role: 'assistant',
    content: response.text(),
    tool_calls: []
  };
}