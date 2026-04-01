import { Bot, InputFile } from 'grammy';
import { config } from '../config/index.js';
import { processUserMessage } from '../agent/loop.js';
import { transcribeAudio } from '../agent/transcription.js';
import { generateSpeech } from '../agent/tts.js';
import { extractTextFromPdf, extractTextFromDocx } from '../agent/document.js';
import { syncLibrary } from '../agent/library.js';
import { memory } from '../memory/history.js';
import { executeWorkflowIfMatches } from '../agent/workflows.js';
import { 
    getUserByTelegramId, 
    createUser, 
    getPlan, 
    getAllPlans,
    checkUserLimit,
    incrementUsage,
    updateLastInteraction,
    createPendingSubscription,
    getPendingSubscriptions,
    verifySubscription,
    getSubscriptionById,
    updateUserPlan,
    updateUserStatus,
    getUserSubscriptions,
    db
} from '../memory/db.js';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';
const streamPipeline = promisify(pipeline);
export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Configurar menú de comandos en Telegram de forma dinámica
const baseCommands = [
    { command: 'start', description: 'Iniciar y recibir saludo' },
    { command: 'reset', description: 'Borrar historial' },
    { command: 'audio', description: 'Configurar voz/texto' },
    { command: 'sync', description: 'Sincronizar Drive' },
    { command: 'ayuda', description: 'Ver ayuda y tips' }
];

// Añadir comandos de IA si están habilitados en el perfil
const iaCommands = Object.keys(config.capabilities.commands || {})
    .filter(cmd => config.capabilities.commands[cmd] === true)
    .map(cmd => ({
        command: cmd,
        description: `IA: ${cmd.replace(/_/g, ' ')}`
    }));

bot.api.setMyCommands([...baseCommands, ...iaCommands]);

// Middleware: Verificación de usuario (Multi-tenant)
bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;

    if (!userId) {
        console.warn('Mensaje ignorado: No se pudo determinar el ID del usuario.');
        return;
    }

    // Verificar si el usuario existe en la DB
    const user = getUserByTelegramId(userId);
    
    if (!user) {
        console.log(`Nuevo usuario detected (ID: ${userId}), redirigiendo a registro...`);
    } else {
        updateLastInteraction(userId);
    }

    await next();
});

// Comandos
bot.command('start', async (ctx) => {
    const userId = ctx.from?.id;
    const userName = ctx.from?.first_name || ctx.from?.username || 'Usuario';
    
    if (!userId) return;

    await ctx.replyWithChatAction('typing');

    const user = getUserByTelegramId(userId);

    if (user) {
        const workflowResponse = await executeWorkflowIfMatches(userId, '/start');
        if (workflowResponse) {
            return await sendLongMessage(ctx, workflowResponse);
        }
    }

    if (user) {
        const plan = getPlan(user.plan);
        const limit = checkUserLimit(userId);
        
        let statusMsg = `¡Bienvenido de nuevo, <b>${userName}</b>! 👋`;
        statusMsg += `\n\n📊 <b>Tu plan:</b> ${plan?.name || user.plan}`;
        
        if (limit.remaining > 0) {
            statusMsg += `\n📨 <b>Mensajes restantes:</b> ${limit.remaining} este mes`;
        } else if (limit.remaining === -1) {
            statusMsg += `\n📨 <b>Mensajes:</b> Ilimitados`;
        } else {
            statusMsg += `\n⚠️ <b>Has alcanzado tu límite de mensajes.</b> Actualiza tu plan para continuar.`;
        }
        
        statusMsg += `\n\n¿En qué puedo ayudarte hoy?`;
        
        return await ctx.reply(statusMsg);
    }

    const plans = getAllPlans();
    
    const planKeyboard = {
        reply_markup: {
            inline_keyboard: plans.map(plan => {
                let label = '';
                if (plan.monthly_requests === -1) {
                    label = `👑 ${plan.name} (Ilimitado)`;
                } else if (plan.price_monthly === 0) {
                    label = `🆓 ${plan.name} (${plan.monthly_requests}/mes)`;
                } else {
                    label = `💎 ${plan.name} (${plan.monthly_requests}/mes - $${plan.price_monthly})`;
                }
                return [{ text: label, callback_data: `plan_${plan.id}` }];
            })
        }
    };

    const welcomeMessage = `
¡Hola! 👋 Soy <b>${config.BOT_NAME}</b>, tu asistente inteligente.

Para comenzar a usarme, selecciona uno de los siguientes planes:

🆓 <b>Freemium</b> - Ideal para probar
• ${plans.find(p => p.id === 'free')?.monthly_requests} mensajes al mes
• Análisis de documentos

💎 <b>Básico</b> - Para uso regular
• ${plans.find(p => p.id === 'basic')?.monthly_requests} mensajes al mes
• Análisis de documentos + Voz

👑 <b>Premium</b> - Sin límites
• Mensajes ilimitados
• Todas las funcionalidades
• Respuesta prioritaria

<i>Selecciona un plan para comenzar:</i>
`.trim();

    await ctx.reply(welcomeMessage.replace(/<[^>]+>/g, ''), planKeyboard);
});

bot.callbackQuery(/plan_(.+)/, async (ctx) => {
    const planId = ctx.match?.[1];
    const userId = ctx.from?.id;
    const userName = ctx.from?.first_name || ctx.from?.username || 'Usuario';
    
    if (!userId || !planId) {
        return await ctx.answerCallbackQuery('Error al procesar la solicitud.');
    }

    const plan = getPlan(planId);
    if (!plan) {
        return await ctx.answerCallbackQuery('Plan no válido.');
    }

    if (plan.price_monthly === 0) {
        createUser({
            telegram_id: userId,
            agent_id: process.env.INSTANCE_ID || 'synergia',
            plan: planId,
            status: 'active',
            name: userName,
            username: ctx.from?.username
        });

        await ctx.answerCallbackQuery(`¡Plan ${plan.name} activado!`);
        
        const welcomeMsg = `
✅ <b>¡Bienvenido a ${config.BOT_NAME}, ${userName}!</b>

📊 <b>Plan seleccionado:</b> ${plan.name}
📨 <b>Mensajes mensuales:</b> ${plan.monthly_requests === -1 ? 'Ilimitados' : plan.monthly_requests}
🆓 <b>Gratis y activado.</b>

<i>¿En qué puedo ayudarte hoy?</i>
`.trim();

        return await ctx.editMessageText(cleanHtml(welcomeMsg));
    }

    await ctx.answerCallbackQuery('Excelente elección. Procede al pago.');

    const methods = config.payment_methods;
    let paymentMsg = `💳 <b>Pago para activar plan ${plan.name}</b>\n\nPara activar tu plan, realiza el pago de <b>$${plan.price_monthly}/mes</b>:\n\n`;

    if (methods) {
        if (methods.pago_movil) {
            paymentMsg += `<b>Opción 1 - Pago Móvil (Venezuela):</b>\n• Banco: <code>${methods.pago_movil.banco}</code>\n• Teléfono: <code>${methods.pago_movil.telefono}</code>\n• C.I.: <code>${methods.pago_movil.cedula}</code>\n\n`;
        }
        if (methods.paypal) {
            paymentMsg += `<b>Opción 2 - PayPal:</b>\n• Correo: <code>${methods.paypal.email}</code>\n${methods.paypal.note ? `<i>${methods.paypal.note}</i>\n` : ''}\n`;
        }
        if (methods.binance) {
            paymentMsg += `<b>Opción 3 - Binance (${methods.binance.currency}):</b>\n• Email/UID: <code>${methods.binance.email}${methods.binance.uid || ''}</code>\n\n`;
        }
    } else {
        paymentMsg += `⚠️ No se han configurado métodos de pago automáticos para este bot. Por favor, contacta con soporte.`;
    }

    paymentMsg += `📎 <b>IMPORTANTE:</b> Envía una captura del comprobante o el número de referencia aquí mismo.\nTu cuenta será activada una vez verificado el pago.`;

    let user = getUserByTelegramId(userId);
    if (!user) {
        user = createUser({
            telegram_id: userId,
            agent_id: process.env.INSTANCE_ID || 'synergia',
            status: 'pending',
            plan: 'free',
            name: userName,
            username: ctx.from?.username
        });
    }

    createPendingSubscription({
        user_id: user.id,
        agent_id: process.env.INSTANCE_ID || 'synergia',
        plan_id: planId,
        status: 'pending'
    });

    await ctx.editMessageText(cleanHtml(paymentMsg));
});

bot.command('reset', async (ctx) => {
    if (ctx.from) {
        await memory.clearHistory(ctx.from.id);
        await ctx.reply('✅ Historial borrado. Empecemos de nuevo.');
    }
});

bot.command(['ayuda', 'help'], async (ctx) => await showHelp(ctx));
bot.hears(/^\/\?$/, async (ctx) => await showHelp(ctx));

async function showHelp(ctx: any) {
    const helpMessage = `🤖 <b>Comandos de ${config.BOT_NAME}:</b>

• /start - Inicia el bot y recibe el saludo inicial.
• /reset - Borra el historial de la conversación actual.
• /audio - Ver el modo de audio actual.
• /audio voz - Activar respuestas con voz.
• /audio texto - Responder solo con texto.
• /audio off - Desactivar audio.
• /sync - Actualizar la base de conocimientos desde Google Drive (Administrador).
• /ayuda o /help - Ver esta lista de ayuda.

<b>Tips:</b>
• Puedes enviarme PDFs o archivos Word para que los analice.
• Puedes enviarme mensajes de voz y te responderé según tu configuración de /audio.`;

    await ctx.reply(helpMessage);
}

bot.command('audio', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.match?.trim().toLowerCase();

    if (!args) {
        const currentMode = memory.getAudioMode(userId);
        const modeDesc = currentMode === 'voice' ? '🎙️ Voz' : currentMode === 'text' ? '✍️ Texto' : '🔇 Desactivado';
        return await ctx.reply(`🔊 Modo de audio actual: <b>${modeDesc}</b>\n\nUsa '/audio voz', '/audio texto' o '/audio off' para cambiarlo.`);
    }

    if (args === 'voz' || args === 'voice') {
        memory.setAudioMode(userId, 'voice');
        await ctx.reply('🎙️ Modo de audio configurado a: <b>Voz</b>. Ahora te responderé con mensajes de audio.');
    } else if (args === 'texto' || args === 'text' || args === '--texto') {
        memory.setAudioMode(userId, 'text');
        await ctx.reply('✍️ Modo de audio configurado a: <b>Texto</b>. Responderé solo con mensajes escritos.');
    } else if (args === 'off' || args === 'desactivar') {
        memory.setAudioMode(userId, 'off');
        await ctx.reply('🔇 Modo de audio configurado a: <b>Desactivado</b>.');
    } else {
        await ctx.reply("❌ Opción no válida. Usa 'voz', 'texto' o 'off'.");
    }
});

bot.command('sync', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!config.GOOGLE_DRIVE_FOLDER_ID) {
        return await ctx.reply('❌ No hay una carpeta de Google Drive configurada en esta instancia (GOOGLE_DRIVE_FOLDER_ID).');
    }

    const initialMsg = await ctx.reply('🔄 Iniciando sincronización de biblioteca con Google Drive...\n<i>Por favor espera, esto puede tardar un momento si hay archivos nuevos o grandes.</i>');
    
    let lastUpdate = Date.now();
    const updateProgress = async (msg: string) => {
         if (Date.now() - lastUpdate > 2500) {
              try {
                  await ctx.api.editMessageText(ctx.chat.id, initialMsg.message_id, `🔄 <b>Sincronizando:</b>\n<i>${msg}</i>`);
                  lastUpdate = Date.now();
              } catch (e) { /* ignore */ }
         }
    };

    try {
        await syncLibrary(updateProgress);
        await ctx.api.editMessageText(ctx.chat.id, initialMsg.message_id, '✅ <b>¡Sincronización completada!</b>\nLos documentos están listos para ser consultados.');
    } catch (e: any) {
        console.error('Error en /sync:', e);
        await ctx.reply(`❌ <b>Error durante la sincronización:</b>\n${e.message}`);
    }
});

bot.command('pagos', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !config.TELEGRAM_ALLOWED_USER_IDS.includes(userId)) return;

    const pending = getPendingSubscriptions();
    if (pending.length === 0) {
        return await ctx.reply('✅ No hay pagos pendientes de verificación.');
    }

    let msg = '📋 <b>Pagos Pendientes:</b>\n\n';
    pending.forEach(sub => {
        msg += `🆔 ID: <code>${sub.id}</code>\n👤 Usuario: ${sub.user_id}\n💎 Plan: ${sub.plan_id}\n🔗 Ref: ${sub.payment_reference || 'N/A'}\n\n`;
    });
    msg += 'Usa /verificar [ID] para aprobar.';

    await ctx.reply(msg);
});

bot.command('verificar', async (ctx) => {
    const adminId = ctx.from?.id;
    if (!adminId || !config.TELEGRAM_ALLOWED_USER_IDS.includes(adminId)) return;

    const subId = parseInt(ctx.match?.trim() || '0');
    if (!subId) return await ctx.reply('Especifique el ID de la suscripción. Ej: /verificar 5');

    const sub = getSubscriptionById(subId);
    if (!sub) return await ctx.reply('Suscripción no encontrada.');

    verifySubscription(subId, adminId);
    
    await ctx.reply(`✅ Suscripción #${subId} verificada correctamente.`);
    
    try {
        const stmt = db.prepare('SELECT telegram_id FROM users WHERE id = ?');
        const internalUser = stmt.get(sub.user_id) as any;
        if (internalUser) {
            await ctx.api.sendMessage(internalUser.telegram_id, `🎉 <b>¡Tu plan ${sub.plan_id} ha sido activado!</b>\nYa puedes empezar a usar todas las funcionalidades.`);
        }
    } catch (e) {
        console.error('Error al notificar al usuario de la activación:', e);
    }
});

bot.on('message:document', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUserByTelegramId(userId);
    if (!user) {
        return await ctx.reply(`¡Hola! Para usar ${config.BOT_NAME}, primero necesitas registrarte.\n\nUsa /start para elegir un plan.`);
    }
    
    const limit = checkUserLimit(userId);
    if (!limit.allowed) {
        const plan = getPlan(limit.plan);
        return await ctx.reply(`⚠️ <b>Límite alcanzado</b>\n\nHas consumido todos los mensajes de tu plan ${plan?.name || limit.plan}.\n\nUsa /start para ver los planes disponibles.`);
    }

    const document = ctx.message.document;
    const fileId = document.file_id;
    let fileName = document.file_name || 'documento_desconocido';
    const caption = ctx.message.caption || '';
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    if (ext !== 'pdf' && ext !== 'docx') {
        return ctx.reply('Lo siento, de momento solo puedo procesar archivos PDF y Word (.docx).');
    }

    incrementUsage(user.id);
    await ctx.replyWithChatAction('typing');

    try {
        const file = await ctx.api.getFile(fileId);
        const filePath = file.file_path;
        if (!filePath) throw new Error('No se pudo obtener la ruta del archivo de Telegram.');

        const tempDir = path.resolve(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

        const localPath = path.resolve(tempDir, `doc_${Date.now()}.${ext}`);
        const fileUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${filePath}`;
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error('Falló la descarga del documento de Telegram');
        
        // @ts-ignore
        await streamPipeline(response.body, fs.createWriteStream(localPath));

        let extractedText = '';
        if (ext === 'pdf') {
            extractedText = await extractTextFromPdf(localPath);
        } else if (ext === 'docx') {
            extractedText = await extractTextFromDocx(localPath);
        }

        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

        let finalPrompt = caption.trim().length > 0 ? `${caption}\n\n--- Documento adjunto (${fileName}) ---\n${extractedText}` : `Por favor analiza este documento (${fileName}):\n\n${extractedText}`;
        
        const MAX_DOC_CHARS = 100000;
        if (finalPrompt.length > MAX_DOC_CHARS) {
             finalPrompt = finalPrompt.substring(0, MAX_DOC_CHARS) + '\n\n... [Texto truncado por límite de longitud]';
             ctx.reply('El documento es muy grande. Solo procesaré las primeras partes del texto.');
        }

        const replyText = await processUserMessage(userId, finalPrompt);
        await sendLongMessage(ctx, replyText);

        if (memory.getAudioMode(userId) === 'voice') {
            const audioPath = await generateSpeech(replyText);
            if (audioPath) {
                await ctx.replyWithVoice(new InputFile(audioPath));
                if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            }
        }
    } catch (error: any) {
        console.error('Error procesando documento:', error);
        await ctx.reply(`Error al procesar el documento: ${error.message}`);
    }
});

bot.on(['message:voice', 'message:audio'], async (ctx) => {
    const userId = ctx.from.id;
    const user = getUserByTelegramId(userId);
    if (!user) {
        return await ctx.reply(`¡Hola! Para usar ${config.BOT_NAME}, primero necesitas registrarte.\n\nUsa /start para elegir un plan.`);
    }
    
    const limit = checkUserLimit(userId);
    if (!limit.allowed) {
        const plan = getPlan(limit.plan);
        return await ctx.reply(`⚠️ <b>Límite alcanzado</b>\n\nHas consumido todos los mensajes de tu plan ${plan?.name || limit.plan}.\n\nUsa /start para ver los planes disponibles.`);
    }

    const file = await ctx.getFile();
    const filePath = file.file_path;
    if (!filePath) return;

    const tempDir = path.resolve(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    let ext = filePath.split('.').pop() || 'ogg';
    if (ext === 'oga') ext = 'ogg';

    const localPath = path.resolve(tempDir, `voice_${Date.now()}.${ext}`);

    incrementUsage(user.id);
    await ctx.replyWithChatAction('typing');

    try {
        const fileUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${filePath}`;
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error('Fallo la descarga del audio de Telegram');
        
        // @ts-ignore
        await streamPipeline(response.body, fs.createWriteStream(localPath));

        const transcribedText = await transcribeAudio(localPath);
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

        const replyText = await processUserMessage(userId, transcribedText);
        await sendLongMessage(ctx, replyText);

        if (memory.getAudioMode(userId) === 'voice') {
            const audioPath = await generateSpeech(replyText);
            if (audioPath) {
                await ctx.replyWithVoice(new InputFile(audioPath));
                if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            }
        }
    } catch (error: any) {
        console.error('Error procesando audio:', error);
        await ctx.reply(`Error con el audio: ${error.message}`);
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    }
});

function cleanHtml(text: string): string {
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const allowedTags = ['b', 'i', 'u', 's', 'strong', 'em', 'code', 'pre', 'br', 'p', 'ul', 'ol', 'li', 'a', 'blockquote'];
    for (const tag of allowedTags) {
        const regex = new RegExp(`&lt;(${tag})&gt;((?:(?!&lt;\\/${tag}&gt;).)*?)&lt;\\/${tag}&gt;`, 'gis');
        html = html.replace(regex, `<$1>$2</$1>`);
    }
    html = html.replace(/&lt;a\s+(href=["\'][^"\']+["\'])\s*&gt;/gis, '<a $1>');
    html = html.replace(/&lt;\/?[a-z][a-z0-9]*([^>]*)&gt;/gi, '');
    return html;
}

async function sendLongMessage(ctx: any, text: string) {
    const MAX_LENGTH = 4090;
    const cleanText = cleanHtml(text);
    const opts = { parse_mode: 'HTML' as const };
    
    if (cleanText.length <= MAX_LENGTH) {
        try {
            return await ctx.reply(cleanText, opts);
        } catch (e: any) {
            return await ctx.reply(cleanText);
        }
    }

    const chunks = [];
    let currentText = cleanText;

    while (currentText.length > 0) {
        if (currentText.length <= MAX_LENGTH) {
            chunks.push(currentText);
            break;
        }
        let cutIndex = currentText.lastIndexOf('\n', MAX_LENGTH);
        if (cutIndex === -1) cutIndex = MAX_LENGTH;
        chunks.push(currentText.substring(0, cutIndex));
        currentText = currentText.substring(cutIndex).trimStart();
    }

    for (const chunk of chunks) {
        try {
            await ctx.api.sendMessage(ctx.chat.id, chunk, opts);
        } catch (e: any) {
            await ctx.api.sendMessage(ctx.chat.id, chunk);
        }
    }
}

bot.on('message:entities:bot_command', async (ctx, next) => {
    const text = ctx.message.text || ctx.message.caption || '';
    const match = text.match(/^\/([a-zA-Z0-9_]+)/);
    if (!match) return next();
    
    const cmdName = match[1].toLowerCase();
    
    if (config.capabilities.commands && config.capabilities.commands[cmdName] !== undefined) {
        if (config.capabilities.commands[cmdName] === true) {
            const userId = ctx.from.id;
            const user = getUserByTelegramId(userId);
            if (!user) {
                return await ctx.reply(`¡Hola! Para usar ${config.BOT_NAME}, primero necesitas registrarte.\n\nUsa /start para elegir un plan.`);
            }
            
            const limit = checkUserLimit(userId);
            if (!limit.allowed) {
                const plan = getPlan(limit.plan);
                return await ctx.reply(`⚠️ <b>Límite alcanzado</b>\n\nHas consumido todos los mensajes de tu plan ${plan?.name || limit.plan}.\n\nUsa /start para ver los planes disponibles.`);
            }
            
            await ctx.replyWithChatAction('typing');
            try {
                const extraText = text.replace(`/${cmdName}`, '').trim();
                const instruction = `[INSTRUCCIÓN INTERNA AL SISTEMA] El usuario ha invocado el comando "/${cmdName}". Tu tarea es ejecutar la acción correspondiente de manera elegante y narrativa, aplicando tu estilo profesional al contexto actual o al texto adjunto: "${extraText}". NO respondas con viñetas mecánicas ni enumeraciones markdown innecesarias, aplica un estilo fluido, descriptivo y académico.`;
                
                const replyText = await processUserMessage(userId, instruction);
                await sendLongMessage(ctx, replyText);

                if (memory.getAudioMode(userId) === 'voice') {
                    const audioPath = await generateSpeech(replyText);
                    if (audioPath) {
                        await ctx.replyWithVoice(new InputFile(audioPath));
                        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
                    }
                }
                incrementUsage(user.id);
            } catch (error: any) {
                console.error(`Error procesando comando dinámico ${cmdName}:`, error);
                await ctx.reply(`Error procesando comando: ${error.message}`);
            }
        } else {
            await ctx.reply('🔒 Este comando no está habilitado en mi configuración actual (plan/versión).');
        }
    } else {
        await ctx.reply('Comando no reconocido. Escribe /ayuda para ver mis opciones.');
    }
});

bot.on('message:text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const user = getUserByTelegramId(userId);
    
    if (!user) {
        return await ctx.reply(`¡Hola! Para usar ${config.BOT_NAME}, primero necesitas registrarte. Usa el comando /start para elegir un plan y comenzar.`);
    }

    const limit = checkUserLimit(userId);
    if (!limit.allowed) {
        const plan = getPlan(limit.plan);
        return await ctx.reply(`Limite alcanzado. Has consumido todos los mensajes de tu plan ${plan?.name || limit.plan}. Usa /start para ver los planes disponibles.`);
    }

    // Manejo de referencia de pago si el usuario está pendiente
    const pendingSub = getUserSubscriptions(user.id).find(s => s.status === 'pending');
    if (pendingSub && text.length < 50 && /^[0-9A-Z]+$/.test(text.toUpperCase())) {
         db.prepare('UPDATE subscriptions SET payment_reference = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(text, pendingSub.id);
         return await ctx.reply('✅ <b>Gracias por enviar tu comprobante/referencia.</b>\nUn administrador verificará el pago a la brevedad.');
    }

    incrementUsage(user.id);
    await ctx.replyWithChatAction('typing');

    let warningPrefix = '';
    if (limit.nearLimit && limit.remaining !== -1) {
        const percentageFormatted = (limit.usagePercentage * 100).toFixed(0);
        warningPrefix = `⚠️ <b>AVISO DE LÍMITE:</b> Has consumido el ${percentageFormatted}% de tu plan mensual. Te quedan ${limit.remaining} mensajes. Considera recargar pronto.\n\n`;
    }

     try {
         let replyText = await processUserMessage(userId, text);
        if (warningPrefix) replyText = warningPrefix + replyText;

         await sendLongMessage(ctx, replyText);

        if (memory.getAudioMode(userId) === 'voice') {
            const audioPath = await generateSpeech(replyText);
            if (audioPath) {
                await ctx.replyWithVoice(new InputFile(audioPath));
                if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            }
        }
    } catch (error: any) {
        console.error('Error al procesar mensaje:', error);
        await ctx.reply(`Error procesando solicitud: ${error.message}`);
    }
});
