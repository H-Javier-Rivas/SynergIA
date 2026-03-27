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

registerTool({
  name: 'tasks_list',
  description: 'Lista las tareas de Google Tasks. Primero lista las listas disponibles, luego las tareas de la lista principal.',
  parameters: {
    type: 'object',
    properties: {
      max: { type: 'number', description: 'Número máximo de tareas a devolver. Por defecto 10.' }
    },
    required: []
  },
  execute: async (args: { max?: number }) => {
    const max = args.max || 10;
    // Obtener listas en JSON
    const listsJson = await runGogCommand(`tasks lists --json`);
    let tasklists: any[] = [];
    try {
      const parsed = JSON.parse(listsJson);
      tasklists = parsed.tasklists || [];
    } catch (e) {
      return 'Error al obtener listas de tareas: ' + listsJson;
    }
    // Buscar primera lista que no sea "Recordatorios antiguos"
    const mainList = tasklists.find((l: any) => !l.title?.includes('Recordatorios antiguos'));
    if (!mainList) {
      return 'No se encontró lista de tareas principal.';
    }
    // Obtener las tareas de esa lista
    return await runGogCommand(`tasks list ${mainList.id} --max ${max}`);
  }
});

registerTool({
  name: 'tasks_create',
  description: 'Crea una nueva tarea en Google Tasks.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Título de la tarea.' },
      due: { type: 'string', description: 'Fecha de vencimiento en formato ISO (ej. "2023-10-25T14:00:00Z").' },
      notes: { type: 'string', description: 'Notas o descripción de la tarea.' }
    },
    required: ['title']
  },
  execute: async (args: { title: string, due?: string, notes?: string }) => {
    // Obtener lista principal con JSON
    const listsJson = await runGogCommand(`tasks lists --json`);
    let tasklists: any[] = [];
    try {
      const parsed = JSON.parse(listsJson);
      tasklists = parsed.tasklists || [];
    } catch (e) {
      return 'Error al obtener listas de tareas.';
    }
    const mainList = tasklists.find((l: any) => !l.title?.includes('Recordatorios antiguos'));
    if (!mainList) {
      return 'No se encontró lista de tareas.';
    }
    const safeTitle = args.title.replace(/"/g, '\\"');
    let cmd = `tasks add ${mainList.id} --title "${safeTitle}"`;
    if (args.due) cmd += ` --due "${args.due}"`;
    if (args.notes) {
      const safeNotes = args.notes.replace(/"/g, '\\"');
      cmd += ` --notes "${safeNotes}"`;
    }
    return await runGogCommand(cmd);
  }
});

registerTool({
  name: 'tasks_complete',
  description: 'Marca una tarea como completada en Google Tasks.',
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'ID de la tarea a completar.' }
    },
    required: ['taskId']
  },
  execute: async (args: { taskId: string }) => {
    // Obtener lista principal con JSON
    const listsJson = await runGogCommand(`tasks lists --json`);
    let tasklists: any[] = [];
    try {
      const parsed = JSON.parse(listsJson);
      tasklists = parsed.tasklists || [];
    } catch (e) {
      return 'Error al obtener listas de tareas.';
    }
    const mainList = tasklists.find((l: any) => !l.title?.includes('Recordatorios antiguos'));
    if (!mainList) {
      return 'No se encontró lista de tareas.';
    }
    return await runGogCommand(`tasks done ${mainList.id} ${args.taskId}`);
  }
});

registerTool({
  name: 'tasks_delete',
  description: 'Elimina una tarea de Google Tasks.',
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'ID de la tarea a eliminar.' }
    },
    required: ['taskId']
  },
  execute: async (args: { taskId: string }) => {
    // Obtener lista principal con JSON
    const listsJson = await runGogCommand(`tasks lists --json`);
    let tasklists: any[] = [];
    try {
      const parsed = JSON.parse(listsJson);
      tasklists = parsed.tasklists || [];
    } catch (e) {
      return 'Error al obtener listas de tareas.';
    }
    const mainList = tasklists.find((l: any) => !l.title?.includes('Recordatorios antiguos'));
    if (!mainList) {
      return 'No se encontró lista de tareas.';
    }
    return await runGogCommand(`tasks delete ${mainList.id} ${args.taskId}`);
  }
});
