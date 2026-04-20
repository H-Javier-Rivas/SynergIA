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
    // Intentar primero con Groq
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile', 
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
    });
    
    const msg = response.choices[0].message;
    if (msg.content || (msg.tool_calls && msg.tool_calls.length > 0)) {
      return msg;
    }
    
    throw new Error("Empty response");
  } catch (error: any) {
    // Fallback 1: OpenRouter
    if (config.OPENROUTER_API_KEY && config.OPENROUTER_API_KEY !== "SUTITUYE POR EL TUYO") {
      try {
        console.log('Intentando fallback a OpenRouter...');
        return await fallbackOpenRouter(messages, tools);
      } catch (orError) {
        console.error('Fallback de OpenRouter falló:', orError);
      }
    }

    // Fallback 2: Gemini
    if (genAI) {
        try {
            console.log('Intentando fallback final a Gemini...');
            return await fallbackGemini(messages, tools);
        } catch (gemError) {
            console.error('Fallback de Gemini falló:', gemError);
        }
    }
  }
  
  throw new Error('Nuestros servidores están experimentando mucha demanda en este momento. Por favor, reintenta en unos segundos.');
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
        "google/gemma-3-27b-it:free",                         // 27B - Confiable
        "meta-llama/llama-3.3-70b-instruct:free"              // 70B - Muy capaz
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

            let response = await fetch(openRouterEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            let data = await response.json();
            
            // Si falla por falta de soporte de herramientas, intentamos de nuevo sin herramientas para este modelo
            if (data.error && (data.error.code === 400 || data.error.code === 404) && 
                (data.error.message.includes("tool") || data.error.message.includes("function"))) {
                console.warn(`⚠️ Modelo ${model} no soporta herramientas. Reintentando sin ellas...`);
                delete payload.tools;
                response = await fetch(openRouterEndpoint, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                data = await response.json();
            }

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
