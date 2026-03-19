import { chatCompletion } from './llm.js';
import { getToolsDefinitions, getTool } from '../tools/index.js';
import { memory, Message } from '../memory/history.js';

// Importa todas las herramientas para que se registren
import '../tools/get_current_time.js';
import '../tools/google.js';

const MAX_ITERATIONS = 10; // límite de seguridad para evitar bucles infinitos

const systemPrompt = `Eres SynergIA, un asistente de Inteligencia Artificial personal y seguro, creado por Hernán Javier Rivas, funcionando como bot de Telegram.
Respondes siempre en español y de forma concisa pero útil.

Tienes las siguientes capacidades especiales en este entorno:
- Puedes leer y analizar documentos adjuntos: el usuario puede enviarte archivos PDF (.pdf) o Word (.docx) directamente en el chat y tú los procesarás automáticamente.
- Puedes recibir y transcribir mensajes de voz: si el usuario te envía un audio, lo transcribirás y responderás según su configuración.
- Puedes responder con voz: si el usuario activa el modo de audio con el comando /audio voz, te responderás con mensajes de voz.
- Tienes acceso a herramientas como la hora actual y búsqueda en Google para responder preguntas que requieran información en tiempo real.
- Tienes memoria de la conversación: recuerdas lo que se ha hablado en sesiones anteriores.

Cuando el usuario te pregunte si puedes hacer algo que esté en esta lista, responde que SÍ y explícale cómo hacerlo.
Cuando alguien te pregunte qué puedes hacer, describe todas tus capacidades.`;

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
            return responseMessage.content || "Sin respuesta del modelo.";
        }
    }
    
    return "Lo siento, alcancé el límite máximo de operaciones internas (Agent Loop limit). Por favor simplifica tu mensaje.";
}
