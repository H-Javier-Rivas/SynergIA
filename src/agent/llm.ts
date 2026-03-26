import { Groq } from 'groq-sdk';
import { config } from '../config/index.js';

import { GoogleGenerativeAI } from "@google/generative-ai";

const groq = new Groq({ 
    apiKey: config.GROQ_API_KEY,
    defaultHeaders: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
});

const genAI = config.GEMINI_API_KEY ? new GoogleGenerativeAI(config.GEMINI_API_KEY) : null;

// El fallback es opcional si el usuario provee una clave de openrouter
const openRouterEndpoint = 'https://openrouter.ai/api/v1/chat/completions';

export async function chatCompletion(messages: any[], tools: any[] = []) {
  try {
    // Intentar primero con Groq (modelo gratis y muy rápido)
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile', 
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
    });
    
    return response.choices[0].message;
  } catch (error: any) {
    // Si recibimos un 403 (Access Denied), es probable que sea un bloqueo regional o de red de Groq
    if (error?.status === 403 || error?.message?.includes('403')) {
        console.warn('Groq detectó un error de acceso (403). Bloqueo regional detectado.');
    } else {
        console.error('Groq Error:', error?.message || error);
    }
    
    // Fallback 1: OpenRouter
    if (config.OPENROUTER_API_KEY && config.OPENROUTER_API_KEY !== "SUTITUYE POR EL TUYO") {
      try {
        console.log('Intentando fallback a OpenRouter...');
        return await fallbackOpenRouter(messages, tools);
      } catch (orError) {
        console.error('Fallback de OpenRouter falló:', orError);
      }
    }

    // Fallback 2: Gemini (El salvavidas definitivo)
    if (genAI) {
        console.log('Intentando fallback final a Gemini 1.5 Flash...');
        return await fallbackGemini(messages, tools);
    }
    
    throw new Error('Fallo la llamada al LLM (Groq, OpenRouter y Gemini no disponibles o fallaron).');
  }
}

async function fallbackGemini(messages: any[], tools: any[]) {
    // Lista de modelos de Gemini a probar en orden de estabilidad/capacidad
    const geminiModels = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-pro-latest"];
    let lastError = null;

    for (const modelName of geminiModels) {
        try {
            console.log(`Intentando chat con Gemini: ${modelName}...`);
            const systemInstruction = messages.find(m => m.role === 'system')?.content;
            
            const model = genAI!.getGenerativeModel({ 
                model: modelName,
                systemInstruction: systemInstruction
            });

            // Convertir historial de OpenAI/Groq -> Formato Gemini
            const contents = messages
                .filter(m => m.role !== 'system')
                .map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content || "" }]
                }));

            const result = await model.generateContent({ contents });

            const response = result.response;
            const text = response.text();
            
            if (text) {
                return {
                    role: 'assistant',
                    content: text,
                    tool_calls: []
                };
            }
        } catch (err: any) {
            lastError = err;
            console.error(`Fallo con Gemini (${modelName}):`, err.message);
            // Si es error de saturacion o saturacion de cuota, probamos el que sigue
            if (err.message.includes("503") || err.message.includes("429")) {
                continue;
            }
            break;
        }
    }
    throw lastError || new Error("Todos los fallbacks de Gemini fallaron.");
}

async function fallbackOpenRouter(messages: any[], tools: any[]) {
    // Lista de modelos gratuitos de OpenRouter (actualizado: 2026-03-26)
    // Ordenados de mayor a menor capacidad para maximizar calidad de respuesta
    const fallbackModels = [
        config.OPENROUTER_MODEL,                              // Modelo configurado en .env
        "meta-llama/llama-3.3-70b-instruct:free",             // 70B - Muy capaz, 65k ctx
        "qwen/qwen3-coder:free",                              // 480B MoE - Excelente para código, 262k ctx
        "nvidia/nemotron-3-super-120b-a12b:free",             // 120B MoE - Buena calidad, 262k ctx
        "google/gemma-3-27b-it:free",                         // 27B - Confiable, 131k ctx
        "mistralai/mistral-small-3.1-24b-instruct:free",      // 24B - Rápido y estable, 128k ctx
        "stepfun/step-3.5-flash:free",                        // Flash - Rápido, 256k ctx
        "meta-llama/llama-3.2-3b-instruct:free"               // 3B - Ligero, último recurso, 131k ctx
    ].filter((m, i, self) => m && self.indexOf(m) === i); // Únicos

    const sanitizedHistory = messages.map(msg => {
        const cleaned: any = { role: msg.role, content: msg.content };
        if (msg.tool_calls) cleaned.tool_calls = msg.tool_calls;
        if (msg.tool_call_id) cleaned.tool_call_id = msg.tool_call_id;
        if (msg.name) cleaned.name = msg.name;
        return cleaned;
    });

    let lastError = null;

    for (const model of fallbackModels) {
        try {
            console.log(`Intentando OpenRouter con modelo: ${model}...`);
            const payload: any = {
                model: model,
                messages: sanitizedHistory
            };

            if (tools.length > 0) {
                payload.tools = tools;
            }

            const response = await fetch(openRouterEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            
            if (data.error) {
                const code = data.error.code;
                const msg = data.error.message || "";
                console.log(`Error en modelo ${model}: ${code} - ${msg}`);
                
                // Si es un error de cuota o modelo no encontrado, probamos el siguiente
                if (code === 429 || code === 404 || code === 400) {
                    lastError = new Error(`OpenRouter Error (${model}): ${msg}`);
                    continue; 
                }
                throw new Error(`OpenRouter API Error: ${msg}`);
            }

            if (!data.choices || data.choices.length === 0) {
                console.log(`Modelo ${model} no devolvió respuestas.`);
                continue;
            }
            
            return data.choices[0].message;

        } catch (err) {
            console.error(`Fallo crítico con modelo ${model}:`, err);
            lastError = err;
        }
    }

    throw lastError || new Error("Todos los fallbacks de OpenRouter fallaron.");
}
