import { registerTool } from './index.js';
import { searchLibrary } from '../agent/library.js';
import { config } from '../config/index.js';

registerTool({
  name: 'search_library',
  description: 'Busca información detallada en la base de conocimientos bibliográfica primaria (PDFs y documentos locales de la biblioteca). Úsala siempre que necesites información académica, teórica o procedimental sobre el doctorado.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'La frase clave, tema o concepto a buscar (ej: "institucionalismo douglass north", "metodologia cualitativa", "normas apa").' },
      limit: { type: 'number', description: 'Cantidad máxima de resultados en bruto a extraer. (Por defecto 3).' }
    },
    required: ['query']
  },
  execute: async (args: { query: string, limit?: number }, userId?: number) => {
    try {
      console.log(`[Tool: search_library] Buscando: "${args.query}" para el usuario ${userId}`);
      
      let allUsers = false;
      if (config.IS_MASTER && userId) {
          const { getUserById } = await import('../memory/db.js');
          const user = getUserById(userId);
          if (user && config.TELEGRAM_ALLOWED_USER_IDS.includes(user.telegram_id)) {
              allUsers = true;
              console.log(`[Tool: search_library] Acceso administrativo concedido (Superuser)`);
          }
      }

      if (!config.GOOGLE_DRIVE_FOLDER_ID && !config.KNOWLEDGE && !allUsers) {
          // Si no hay configuración global, igual buscamos en la personal del usuario
          if (!userId) {
              return "Advertencia: El Tutor no tiene configurada una biblioteca global y no se ha identificado el contexto de usuario.";
          }
      }

      const results = searchLibrary(args.query, args.limit || 3, userId, allUsers);
      
      if (results.length === 0) {
          return `No se encontraron resultados en ninguna biblioteca (Global o Personal) para la búsqueda: "${args.query}".`;
      }

      let response = `--- Resultados de búsqueda bibliográfica para: "${args.query}" ---\n\n`;
      for (const res of results) {
          const pageInfo = res.page ? ` [Página ${res.page}]` : '';
          const citationInfo = (res.author && res.year) ? ` (${res.author}, ${res.year})` : '';
          
          response += `[Fuente: ${res.name}] (Ubicación: ${res.source})${pageInfo}${citationInfo}\n`;
          response += `Contenido: ${res.snippet}\n\n`;
      }

      response += `\nINSTRUCCIÓN PARA EL ASISTENTE: Utiliza estos fragmentos para responder con precisión. Si existe número de página y autor/año, DEBES incluir la cita textual siguiendo normas APA.`;

      return response;
    } catch (e: any) {
      console.error(`Error en search_library:`, e);
      return `Error fatal consultando la biblioteca: ${e.message}`;
    }
  }
});
