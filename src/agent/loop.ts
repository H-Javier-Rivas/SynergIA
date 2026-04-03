import { chatCompletion } from './llm.js';
import { getToolsDefinitions, getTool } from '../tools/index.js';
import { memory, Message } from '../memory/history.js';

// Importa todas las herramientas para que se registren
import '../tools/get_current_time.js';
import '../tools/google.js';
import '../tools/web.js';
import '../tools/library.js';
import '../tools/email.js';
import '../tools/admin.js';



const MAX_ITERATIONS = 10; // límite de seguridad para evitar bucles infinitos

import { config } from '../config/index.js';

const defaultSystemPrompt = `Eres ${config.BOT_NAME}, el asistente de Inteligencia Artificial ("Súper Bot") personal y seguro creado por Hernán Javier Rivas.
Funcionas como bot de Telegram y tu estilo de comunicación es sumamente elegante, académico, fluido y natural.`;

const basePrompt = config.SYSTEM_PROMPT || defaultSystemPrompt;
const knowledgePrompt = config.KNOWLEDGE ? `\n\n--- BIBLIOGRAFÍA Y CONOCIMIENTO BASE ---\nUSARÁS LA SIGUIENTE INFORMACIÓN COMO TU FUENTE PRINCIPAL DE VERDAD PARA RESPONDER PREGUNTAS SOBRE EL DOCTORADO Y CIENCIAS ADMINISTRATIVAS:\n\n${config.KNOWLEDGE}` : '';

const systemPrompt = basePrompt + knowledgePrompt;

export async function processUserMessage(userId: number, text: string): Promise<string> {
    // 1. Guardar mensaje del usuario
    await memory.saveMessage({
        user_id: userId,
        role: 'user',
        content: text
    });

    let currentIteration = 0;
    
    while (currentIteration < MAX_ITERATIONS) {
        currentIteration++;
        
        // 2. Construir el contexto actual (Historial)
        const history = memory.getHistory(userId, 30);
        
        // Formatear el historial para el LLM
        const _messages: any[] = [
            { role: 'system', content: systemPrompt },
            ...history.map(m => {
                const base: any = { role: m.role, content: m.content || "" };
                if (m.tool_calls) base.tool_calls = m.tool_calls;
                if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
                return base;
            })
        ];

        // 3. Llamar al LLM
        const definitions = getToolsDefinitions();
        const responseMessage = await chatCompletion(_messages, definitions);

        // 4. Guardar la respuesta del asistente (texto o llamada a herramienta)
        await memory.saveMessage({
            user_id: userId,
            role: 'assistant',
            content: responseMessage.content || "",
            tool_calls: responseMessage.tool_calls ? responseMessage.tool_calls as unknown as string : undefined
        });

        // 5. Analizar si la respuesta fue final o una llamada a herramienta (Agent loop)
        const toolCalls = responseMessage.tool_calls;
        
        if (toolCalls && toolCalls.length > 0) {
            // Actuar: Ejecutar herramientas
            for (const toolCall of toolCalls) {
                const functionName = toolCall.function.name;
                const tool = getTool(functionName);
                
                let result = '';
                
                if (!tool) {
                    result = `Error: Tool ${functionName} not found.`;
                } else {
                    try {
                        const args = JSON.parse(toolCall.function.arguments || '{}');
                        result = await tool.execute(args);
                    } catch (e: any) {
                        result = `Error ejecutando herramienta: ${e.message}`;
                    }
                }
                
                // Observar: Proveer resultado al agente para la próxima iteración
                await memory.saveMessage({
                    user_id: userId,
                    role: 'tool',
                    content: result,
                    tool_call_id: toolCall.id
                });
            }
            // Continuar al siguiente ciclo del bucle while para que el agente vea el resultado de la herramienta
        } else {
            // Respuesta final completada
            if (!responseMessage.content) {
                 throw new Error("Empty response content from all providers.");
            }
            return responseMessage.content;
        }
    }
    
    return "Lo siento, alcancé el límite máximo de operaciones internas (Agent Loop limit). Por favor simplifica tu mensaje.";
}
