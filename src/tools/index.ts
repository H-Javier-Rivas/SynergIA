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

export function getToolsDefinitions() {
    return getAllTools().map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
        }
    }));
}
