import { registerTool } from './index.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import path from 'path';

async function runGogCommand(command: string): Promise<string> {
  const gogPath = path.resolve(process.cwd(), process.platform === 'win32' ? 'gog.exe' : 'gog');
  try {
    const { stdout, stderr } = await execAsync(`"${gogPath}" ${command}`);
    if (stderr && !stdout) {
      console.warn('gog stderr:', stderr);
    }
    return stdout || stderr || 'Command executed successfully with no output.';
  } catch (error: any) {
    console.error(`gog command failed: ${command}`, error);
    return `Error ejecutando gog: ${error.message}\n${error.stdout || ''}\n${error.stderr || ''}`;
  }
}

registerTool({
  name: 'gmail_search',
  description: 'Busca correos electrónicos en Gmail usando una consulta al estilo Gmail (ej. "is:unread", "from:juan", "newer_than:2d").',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'La consulta de búsqueda (ej. "is:unread", "from:juan").' },
      max: { type: 'number', description: 'Número máximo de hilos a devolver. Por defecto 10.' }
    },
    required: ['query']
  },
  execute: async (args: { query: string, max?: number }) => {
    const max = args.max || 10;
    // Escapar comillas dobles en la consulta
    const safeQuery = args.query.replace(/"/g, '\\"');
    return await runGogCommand(`gmail search "${safeQuery}" --max ${max}`);
  }
});

registerTool({
  name: 'gmail_send',
  description: 'Envía un correo electrónico simple (texto plano).',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Dirección de correo electrónico del destinatario.' },
      subject: { type: 'string', description: 'Asunto del correo.' },
      body: { type: 'string', description: 'Cuerpo del mensaje en texto plano (sin saltos de línea complejos).' }
    },
    required: ['to', 'subject', 'body']
  },
  execute: async (args: { to: string, subject: string, body: string }) => {
    const safeTo = args.to.replace(/"/g, '\\"');
    const safeSubject = args.subject.replace(/"/g, '\\"');
    const safeBody = args.body.replace(/"/g, '\\"');
    return await runGogCommand(`gmail send --to "${safeTo}" --subject "${safeSubject}" --body "${safeBody}"`);
  }
});

registerTool({
  name: 'calendar_get_events',
  description: 'Obtiene los eventos del calendario principal en un rango de fechas ISO.',
  parameters: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Fecha de inicio en formato ISO (ej. "2023-10-25T00:00:00Z").' },
      to: { type: 'string', description: 'Fecha de fin en formato ISO (ej. "2023-10-26T00:00:00Z").' }
    },
    required: ['from', 'to']
  },
  execute: async (args: { from: string, to: string }) => {
    return await runGogCommand(`calendar events primary --from "${args.from}" --to "${args.to}"`);
  }
});

registerTool({
  name: 'drive_search',
  description: 'Busca archivos en Google Drive por nombre o contenido.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Término de búsqueda.' },
      max: { type: 'number', description: 'Número máximo de archivos a devolver. Por defecto 10.' }
    },
    required: ['query']
  },
  execute: async (args: { query: string, max?: number }) => {
    const max = args.max || 10;
    const safeQuery = args.query.replace(/"/g, '\\"');
    return await runGogCommand(`drive search "${safeQuery}" --max ${max}`);
  }
});

registerTool({
  name: 'calendar_create_event',
  description: 'Crea un nuevo evento en el calendario principal.',
  parameters: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Título o resumen del evento.' },
      from: { type: 'string', description: 'Fecha y hora de inicio en formato ISO (ej. "2023-10-25T14:00:00Z").' },
      to: { type: 'string', description: 'Fecha y hora de fin en formato ISO (ej. "2023-10-25T15:00:00Z").' }
    },
    required: ['summary', 'from', 'to']
  },
  execute: async (args: { summary: string, from: string, to: string }) => {
    const safeSummary = args.summary.replace(/"/g, '\\"');
    return await runGogCommand(`calendar create primary --summary "${safeSummary}" --from "${args.from}" --to "${args.to}"`);
  }
});

registerTool({
  name: 'gmail_delete_by_query',
  description: 'Elimina permanentemente correos electrónicos basándose en una consulta de búsqueda de Gmail (ej. "from:chess.com"). Usar con precaución.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Consulta de búsqueda para encontrar los correos a eliminar.' },
      max: { type: 'number', description: 'Número máximo de correos a eliminar en esta operación (por defecto 10).' }
    },
    required: ['query']
  },
  execute: async (args: { query: string, max?: number }) => {
    const max = args.max || 10;
    const safeQuery = args.query.replace(/"/g, '\\"');
    
    // 1. Encontrar los IDs de los mensajes
    const searchResultStr = await runGogCommand(`gmail messages search "${safeQuery}" --json --max ${max} --results-only`);
    
    let messages: any[] = [];
    try {
      messages = JSON.parse(searchResultStr);
      if (!Array.isArray(messages)) messages = [messages];
    } catch (e) {
      if (searchResultStr.toLowerCase().includes('0 found') || searchResultStr.trim() === '') {
         return 'No se encontraron correos para eliminar con esa consulta.';
      }
      return `Error al buscar correos para eliminar o no hay resultados legibles: ${searchResultStr}`;
    }

    const ids = messages.map(m => m?.id).filter(Boolean);
    if (ids.length === 0) {
      return 'No se encontraron IDs de mensajes válidos para eliminar con esa consulta.';
    }

    // 2. Eliminar en lote (batch delete)
    const deleteResult = await runGogCommand(`gmail batch delete ${ids.join(' ')} --force`);
    return `Se enviaron a eliminar ${ids.length} correos (IDs: ${ids.join(', ')}).\nResultado:\n${deleteResult}`;
  }
});

registerTool({
  name: 'gmail_get',
  description: 'Obtiene el contenido detallado de un correo electrónico específico usando su ID.',
  parameters: {
    type: 'object',
    properties: {
      messageId: { type: 'string', description: 'El ID del mensaje de correo a recuperar.' }
    },
    required: ['messageId']
  },
  execute: async (args: { messageId: string }) => {
    return await runGogCommand(`gmail get ${args.messageId} --json`);
  }
});
