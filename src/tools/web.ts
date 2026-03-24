import { registerTool } from './index.js';

registerTool({
  name: 'read_url',
  description: 'Lee el contenido de una URL (página web) para analizar su texto y poder responder preguntas sobre él.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'La URL completa de la página a leer (ej: https://wikipedia.org/wiki/Gestion).' }
    },
    required: ['url']
  },
  execute: async (args: { url: string }) => {
    try {
      console.log(`[Tool: read_url] Leyendo ${args.url}...`);
      const response = await fetch(args.url, {
         headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
         }
      });
      
      if (!response.ok) return `Error al acceder a la URL: ${response.status} ${response.statusText}`;
      
      const text = await response.text();
      
      // Limpieza básica de HTML: extrae el texto del body y quita scripts/estilos/etiquetas
      const bodyMatches = text.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      let content = bodyMatches ? bodyMatches[1] : text;
      
      content = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Quitar scripts
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')   // Quitar CSS
        .replace(/<[^>]+>/g, ' ')                          // Quitar etiquetas HTML restantes
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')                              // Colapsar espacios
        .trim();

      if (content.length === 0) return "La URL se leyó correctamente pero no se encontró texto legible.";

      return content.substring(0, 20000); // Devolvemos el primer bloque de texto (20k chars)
    } catch (e: any) {
      console.error(`Error en read_url:`, e);
      return `Error fatal leyendo la URL: ${e.message}`;
    }
  }
});
