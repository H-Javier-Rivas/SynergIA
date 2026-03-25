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
  execute: async (args: { query: string, limit?: number }) => {
    try {
      console.log(`[Tool: search_library] Buscando: "${args.query}"`);
      if (!config.GOOGLE_DRIVE_FOLDER_ID && !config.KNOWLEDGE) {

         return "Advertencia: El Tutor no tiene configurada una carpeta de Drive ni un archivo base para su biblioteca de conocimientos.";
      }

      const results = searchLibrary(args.query, args.limit || 3);
      
      if (results.length === 0) {
          return `No se encontraron resultados en la biblioteca primaria para la búsqueda: "${args.query}".`;
      }

      let response = `--- Resultados de búsqueda en la Biblioteca Primary para: "${args.query}" ---\n\n`;
      for (const res of results) {
          response += `[Fuente: ${res.name}]\nTexto encontrado: ...${res.snippet}\n\n`;
      }

      return response;
    } catch (e: any) {
      console.error(`Error en search_library:`, e);
      return `Error fatal consultando la biblioteca: ${e.message}`;
    }
  }
});
