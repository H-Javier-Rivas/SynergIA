import { runGogCommand } from '../agent/library.js';
import { registerTool } from './index.js';

export const search_emails_tool = {
    name: 'search_emails',
    description: 'Busca correos electrónicos en Gmail usando la sintaxis de búsqueda de Google (ej. "is:unread", "from:alguien@ejemplo.com"). Retorna una lista de hilos/mensajes con sus IDs y asuntos.',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'La consulta de búsqueda (ej: "is:unread").'
            },
            maxResults: {
                type: 'number',
                description: 'Número máximo de resultados a retornar (por defecto 5).',
                default: 5
            }
        },
        required: ['query']
    },
    execute: async ({ query, maxResults = 5 }: { query: string, maxResults?: number }) => {
        try {
            // gog gmail search "<query>" --json --max <n>
            const resultStr = await runGogCommand(`gmail search "${query}" --json --max ${maxResults}`);
            if (!resultStr.trim()) return 'No se encontraron correos con esa búsqueda.';
            
            const data = JSON.parse(resultStr);
            const threads = data.threads || data.messages || [];
            
            if (threads.length === 0) return 'No hay correos que coincidan con la búsqueda.';
            
            return threads.map((t: any) => {
                return `ID: ${t.id} | Asunto: ${t.snippet || 'Sin asunto'}`;
            }).join('\n');
            
        } catch (error: any) {
            console.error('Error en search_emails_tool:', error);
            return `Error buscando correos: ${error.message}`;
        }
    }
};

export const get_email_tool = {
    name: 'get_email',
    description: 'Obtiene el contenido detallado de un correo electrónico específico usando su ID.',
    parameters: {
        type: 'object',
        properties: {
            messageId: {
                type: 'string',
                description: 'The unique Gmail message/thread ID (string of hex characters). Must be a real ID obtained from search_emails.'
            }
        },
        required: ['messageId']
    },
    execute: async ({ messageId }: { messageId: string }) => {
        try {
            // Evitar que el LLM use la descripción como valor
            if (!messageId || messageId.length < 5 || messageId.includes(' ')) {
                return 'Error: El ID del mensaje no es válido. Debes usar un ID real obtenido de search_emails.';
            }

            // gog gmail get <id> --json
            const resultStr = await runGogCommand(`gmail get ${messageId} --json`);
            if (!resultStr.trim()) return 'No se pudo recuperar el correo.';
            
            const msg = JSON.parse(resultStr);
            
            // Extraer info relevante del JSON de Gmail
            const subject = msg.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || 'Sin asunto';
            const from = msg.payload?.headers?.find((h: any) => h.name === 'From')?.value || 'Desconocido';
            const body = msg.snippet || 'Sin resumen disponible.';
            
            return `De: ${from}\nAsunto: ${subject}\n\nContenido: ${body}`;
            
        } catch (error: any) {
            console.error('Error en get_email_tool:', error);
            return `Error obteniendo el correo: ${error.message}`;
        }
    }
};

registerTool(search_emails_tool);
registerTool(get_email_tool);
