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
import { getUserByTelegramId } from '../memory/db.js';

const defaultSystemPrompt = `Eres ${config.BOT_NAME}, el asistente de Inteligencia Artificial ("Súper Bot") personal y seguro creado por Hernán Javier Rivas.
Funcionas como bot de Telegram y tu estilo de comunicación es sumamente elegante, académico, fluido y natural.

REGLA CRUCIAL SOBRE HERRAMIENTAS:
1. Jamás utilices la descripción de los argumentos de una función como si fueran los valores a pasar.
2. Si una herramienta requiere un ID (como get_email), no lo inventes. Si no lo tienes, utiliza primero una herramienta de búsqueda (como search_emails) para encontrar el ID correcto.
3. Si el usuario pide "ver un mensaje" se suele referir al historial de la conversación o a un texto previo, NO a un correo de Gmail a menos que mencione explícitamente "correo" o "Gmail".`;

const formattingRule = `\n\nREGLA DE FORMATO CRITICA:
- Usa EXCLUSIVAMENTE etiquetas HTML soportadas por Telegram (<b>, <i>, <u>, <s>, <code>, <pre>, <a>, <blockquote>) para dar formato.
- NUNCA uses Markdown (como **negrita**, *cursiva*, # encabezados o [enlace](url)).
- Si necesitas saltos de línea o párrafos, usa saltos de línea normales (\n), NO etiquetas <p> o <br>.`;

const basePrompt = (config.SYSTEM_PROMPT || defaultSystemPrompt) + formattingRule;
const knowledgePrompt = config.KNOWLEDGE ? `\n\n--- BIBLIOGRAFÍA Y CONOCIMIENTO BASE ---\nUSARÁS LA SIGUIENTE INFORMACIÓN COMO TU FUENTE PRINCIPAL DE VERDAD PARA RESPONDER PREGUNTAS SOBRE EL DOCTORADO Y CIENCIAS ADMINISTRATIVAS:\n\n${config.KNOWLEDGE}` : '';

const systemPrompt = basePrompt + knowledgePrompt;

    export async function processUserMessage(telegramId: number, text: string): Promise<string> {
        // 0. Obtener ID interno de la DB
        const user = getUserByTelegramId(telegramId);
        if (!user) throw new Error(`Usuario ${telegramId} no encontrado en la DB local.`);
        const dbUserId = user.id;

        // 1. Determinar el Rol del Usuario
        const isProfessor = config.TELEGRAM_ALLOWED_USER_IDS.includes(telegramId);
        const roleContext = isProfessor 
            ? "\n\n[CONTEXTO DE ROL] Estás hablando con el PROFESOR/ADMINISTRADOR. Responde como un colega experto y asistente académico. Puedes dar respuestas directas, soluciones completas y apoyo en la preparación de clases."
            : "\n\n[CONTEXTO DE ROL] Estás hablando con un ESTUDIANTE. Actúa como un tutor pedagógico: nunca des la respuesta directamente, guía al alumno con preguntas socráticas, pistas y explicaciones conceptuales para que llegue a la solución por sí mismo.";

        const dynamicSystemPrompt = systemPrompt + roleContext;

        // 2. Guardar mensaje del usuario
        await memory.saveMessage({
            user_id: dbUserId,
            role: 'user',
            content: text
        });

    let currentIteration = 0;
    
    while (currentIteration < MAX_ITERATIONS) {
        currentIteration++;
        
        // 3. Construir el contexto actual (Historial)
        const history = memory.getHistory(dbUserId, 30);
        
        // Formatear el historial para el LLM
        const _messages: any[] = [
            { role: 'system', content: dynamicSystemPrompt },
            ...history.map(m => {
                const base: any = { role: m.role, content: m.content || "" };
                if (m.tool_calls) base.tool_calls = m.tool_calls;
                if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
                return base;
            })
        ];

        // 4. Llamar al LLM
        const definitions = getToolsDefinitions();
        const responseMessage = await chatCompletion(_messages, definitions);

        // 5. Guardar la respuesta del asistente (texto o llamada a herramienta)
        await memory.saveMessage({
            user_id: dbUserId,
            role: 'assistant',
            content: responseMessage.content || "",
            tool_calls: responseMessage.tool_calls ? responseMessage.tool_calls as unknown as string : undefined
        });

        // 6. Analizar si la respuesta fue final o una llamada a herramienta (Agent loop)
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
                        result = await tool.execute(args, telegramId);
                    } catch (e: any) {
                        result = `Error ejecutando herramienta: ${e.message}`;
                    }
                }
                
                // Observar: Proveer resultado al agente para la próxima iteración
                await memory.saveMessage({
                    user_id: dbUserId,
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
