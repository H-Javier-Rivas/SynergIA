import { Bot } from 'grammy';
import { config } from '../config/index.js';
import { 
    getUserByTelegramId, 
    updateLastInteraction,
    getPlan,
    checkUserLimit
} from '../memory/db.js';
import { processUserMessage } from '../agent/loop.js';
import { generateSpeech } from '../agent/tts.js';
import { memory } from '../memory/history.js';
import { getTool } from '../tools/index.js';
import { executeWorkflowIfMatches } from '../agent/workflows.js';

// Importar Handlers
import { commands } from './handlers/commands.js';
import { messages } from './handlers/messages.js';
import { callbacks } from './handlers/callbacks.js';
import { photos } from './handlers/photos.js';
import { sendLongMessage } from './utils.js';

export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// 1. Middleware: Registro y Actualización de interacción
bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const user = getUserByTelegramId(userId);
    if (user) {
        updateLastInteraction(userId);
    }

    await next();
});

// 2. Cargar Handlers (orden importa: photos antes que messages para evitar colisión)
bot.use(commands);
bot.use(callbacks);
bot.use(photos);
bot.use(messages);

// 3. Manejador de Comandos Dinámicos (AI Tools)
bot.on('message:entities:bot_command', async (ctx, next) => {
    const text = ctx.message.text || ctx.message.caption || '';
    const match = text.match(/^\/([a-zA-Z0-9_]+)/);
    if (!match) return next();
    
    const cmdName = match[1].toLowerCase();
    
    // Si ya fue manejado por commands (estáticos), no hacemos nada
    // Pero bot.on corre después de bot.use(commands) si no se detiene la propagación.
    // Grammy detiene la propagación si el comando coincide, así que esto solo llega aquí si NO es un comando estático.

    const userId = ctx.from.id;
    const user = getUserByTelegramId(userId);

    if (config.capabilities.commands?.[cmdName]) {
        if (!user) {
            return await ctx.reply(`¡Hola! Por favor usa /start para registrarte.`);
        }
        
        const limit = checkUserLimit(userId);
        if (!limit.allowed) {
            const plan = getPlan(limit.plan);
            return await ctx.reply(`⚠️ Límite alcanzado en tu plan ${plan?.name || limit.plan}.`);
        }
        
        await ctx.replyWithChatAction('typing');
        try {
            const extraText = text.replace(`/${cmdName}`, '').trim();
            const tool = getTool(cmdName);
            
            let instruction = `[EJECUCIÓN DE COMANDO /${cmdName}]\n${extraText}`;
            if (tool) {
                instruction = `[INSTRUCCIÓN CRÍTICA] El usuario activó /${cmdName}. Ejecuta la herramienta de inmediato. ${extraText}`;
            }

            const replyText = await processUserMessage(userId, instruction);
            await sendLongMessage(ctx, replyText);

            if (memory.getAudioMode(userId) === 'voice') {
                const audioPath = await generateSpeech(replyText);
                if (audioPath) {
                    await ctx.api.sendVoice(ctx.chat.id, audioPath);
                }
            }
        } catch (error: any) {
            console.error(`Error en comando dinámico ${cmdName}:`, error);
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    } else {
        // Workflows
        const workflowResponse = await executeWorkflowIfMatches(userId, text);
        if (workflowResponse) {
            return await sendLongMessage(ctx, workflowResponse);
        }
        // Si llegamos aquí, el comando no existe
        // Pero cuidado, grammy ya manejó los comandos conocidos en bot.use(commands)
    }
});
