import { registerTool } from './index.js';

registerTool({
  name: 'get_current_time',
  description: 'Obtiene la hora actual del sistema en formato ISO. Útil para saber qué hora es exactamente para tareas orientadas al tiempo.',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  execute: () => {
    return new Date().toISOString();
  }
});
