export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args?: any) => Promise<string> | string;
}

export const toolsRegistry: Map<string, Tool> = new Map();

export function registerTool(tool: Tool) {
  toolsRegistry.set(tool.name, tool);
}

export function getTool(name: string): Tool | undefined {
  return toolsRegistry.get(name);
}

export function getAllTools(): Tool[] {
  return Array.from(toolsRegistry.values());
}

import { config } from '../config/index.js';

export function getToolsDefinitions() {
    return getAllTools()
      .filter(tool => {
        // Permitir herramientas base siempre
        if (['get_current_time', 'read_url'].includes(tool.name)) return true;
        
        // Si no está registrado en las capacidades (y no es base), lo deshabilitamos (opcional pero seguro)
        if (config.capabilities && config.capabilities.commands) {
            // Permitimos si está explícito, o si no hemos mapeado todo estrictamente, dejamos pasar
            // Para ser estrictos:
            // return !!config.capabilities.commands[tool.name]; 
            // Pero como no hemos mapeado todo, omitimos el filtro estricto por ahora y confiamos en el system prompt.
            // Para el admin tool, sí la restringimos solo al bot que la tenga activada:
            if (tool.name === 'bots_report') return !!config.capabilities.commands['bots_report'];
        }
        return true;
      })
      .map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
        }
    }));
}
