import { registerTool } from './index.js';
import { config } from '../config/index.js';
import { bot } from '../bot/telegram.js';

console.log("[CONFIG] Registrando herramientas de Telegram (Broadcasting)...");

registerTool({
  name: 'send_group_message',
  description: 'Envía un mensaje directamente al grupo oficial de Estadística. Úsala INMEDIATAMENTE cuando el profesor te pida publicar algo en el grupo. No necesitas verificar el ID, ya está configurado internamente.',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'El contenido del mensaje a enviar al grupo. Usa formato HTML (<b>, <i>, etc.).'
      }
    },
    required: ['message']
  },
  execute: async ({ message }) => {
    try {
      if (!config.TELEGRAM_GROUP_ID) {
        return "Error: No tengo configurado el TELEGRAM_GROUP_ID. Pídele al profesor que lo configure en el archivo .env.estadistica.";
      }

      await bot.api.sendMessage(config.TELEGRAM_GROUP_ID, message, { parse_mode: 'HTML' });
      return `✅ Mensaje enviado exitosamente al grupo.`;
    } catch (e: any) {
      return `❌ Error al enviar mensaje al grupo: ${e.message}`;
    }
  }
});
