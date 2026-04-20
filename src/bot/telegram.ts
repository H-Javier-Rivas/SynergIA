import { Bot, InputFile, InlineKeyboard } from 'grammy';
import { config } from '../config/index.js';
import { processUserMessage } from '../agent/loop.js';
import { transcribeAudio } from '../agent/transcription.js';
import { generateSpeech } from '../agent/tts.js';
import { extractTextFromPdf, extractTextFromDocx, extractPagesFromPdf, extractMetadata } from '../agent/document.js';
import { syncLibrary } from '../agent/library.js';
import { memory } from '../memory/history.js';
import { executeWorkflowIfMatches } from '../agent/workflows.js';
import { getTool } from '../tools/index.js';
import { 
    getUserByTelegramId, 
    createUser, 
    getPlan, 
    getAllPlans,
    checkUserLimit,
    incrementUsage,
    decrementUsage,
    updateLastInteraction,
    createPendingSubscription,
    getPendingSubscriptions,
    verifySubscription,
    getSubscriptionById,
    updateUserPlan,
    updateUserStatus,
    getUserSubscriptions,
    db,
    deleteUserComplete,
    restoreUserComplete,
    saveToPersonalLibrary
} from '../memory/db.js';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';
const streamPipeline = promisify(pipeline);
export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

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
        
        statusMsg += `\n\nSelecciona un plan si deseas actualizar:`;
        
        return await ctx.reply(statusMsg, { parse_mode: 'HTML', ...planKeyboard });
    }

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
        let user = getUserByTelegramId(userId);
        if (!user) {
            createUser({
                telegram_id: userId,
                agent_id: process.env.INSTANCE_ID || 'synergia',
                plan: planId,
                status: 'active',
                name: userName,
                username: ctx.from?.username
            });
        } else {
            updateUserPlan(user.id, planId);
            updateUserStatus(user.id, 'active');
        }

        await ctx.answerCallbackQuery(`¡Plan ${plan.name} activado!`);
        
        const welcomeMsg = `
✅ <b>¡Bienvenido a ${config.BOT_NAME}, ${userName}!</b>

📊 <b>Plan seleccionado:</b> ${plan.name}
📨 <b>Mensajes mensuales:</b> ${plan.monthly_requests === -1 ? 'Ilimitados' : plan.monthly_requests}
🆓 <b>Gratis y activado.</b>

<i>¿En qué puedo ayudarte hoy?</i>
`.trim();

        return await ctx.editMessageText(cleanHtml(welcomeMsg), { parse_mode: 'HTML' });
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

    await ctx.editMessageText(cleanHtml(paymentMsg), { parse_mode: 'HTML' });
});

bot.command('reset', async (ctx) => {
    if (ctx.from) {
        await memory.clearHistory(ctx.from.id);
        await ctx.reply('✅ Historial borrado. Empecemos de nuevo.');
    }
});

bot.command('hardreset', async (ctx) => {
    if (ctx.from) {
        try {
            await memory.clearHistory(ctx.from.id);
            deleteUserComplete(ctx.from.id);
            await ctx.reply('⚠️ <b>HARD RESET COMPLETADO</b> ⚠️\n\nTu usuario, suscripción y consumo han sido eliminados de la base de datos de forma permanente.\n\nEscribe /start para iniciar el flujo de usuario nuevo.', { parse_mode: 'HTML' });
        } catch (error) {
            console.error('Error in hardreset:', error);
            await ctx.reply('❌ Error al realizar el hard reset.');
        }
    }
});

bot.command('restore', async (ctx) => {
    if (ctx.from) {
        try {
            const success = restoreUserComplete(ctx.from.id);
            if (success) {
                await memory.clearHistory(ctx.from.id); // Limpiar caché de memoria para forzar recarga desde DB
                await ctx.reply('✅ <b>RESTAURACIÓN COMPLETADA</b> ✅\n\nTu perfil, historial de doctorado y configuración han sido restaurados desde el último respaldo.\n\nEscribe cualquier cosa para continuar donde lo dejaste.', { parse_mode: 'HTML' });
            } else {
                await ctx.reply('❌ No se encontró un respaldo válido o hubo un error en la restauración.');
            }
        } catch (error) {
            console.error('Error in restore command:', error);
            await ctx.reply('❌ Error técnico al intentar restaurar los datos.');
        }
    }
});

bot.command(['ayuda', 'help'], async (ctx) => await showHelp(ctx));

bot.command('about', async (ctx) => {
    const aboutMsg = `💼 <b>Sobre SynergIA & Hernán Javier Rivas</b>

SynergIA es más que un bot; es un ecosistema de inteligencia artificial diseñado para potenciar la productividad y el aprendizaje académico.

<b>Hernán Javier Rivas:</b>
Fundador, CEO y Arquitecto detrás de este ecosistema. Con una visión centrada en la eficiencia, Hernán ha diseñado SynergIA para ser el aliado definitivo de doctorandos, investigadores y profesionales.

<b>Misión:</b>
Democratizar el acceso a herramientas de IA de alto nivel, proporcionando asistentes especializados que comprenden contextualmente las necesidades de sus usuarios.

<i>"Innovación con propósito, tecnología con sentido."</i>`;
    await ctx.reply(aboutMsg, { parse_mode: 'HTML' });
});

bot.hears(/^\/\?$/, async (ctx) => await showHelp(ctx));

async function showHelp(ctx: any) {
    const publicHelp = `🤖 <b>Comandos Básicos de ${config.BOT_NAME}:</b>
• /start - Ver mi plan y estado.
• /reset - Limpiar memoria del chat.
• /audio - Configurar Voz/Texto.
• /about - Sobre este proyecto.
• /ayuda - Ver esta lista.`;

    const aiCmds = Object.keys(config.capabilities.commands || {})
        .filter(cmd => config.capabilities.commands[cmd] === true && cmd !== 'about')
        .map(cmd => `• /${cmd} - ${cmd.replace(/_/g, ' ')}`)
        .join('\n');

    const aiHelp = aiCmds ? `\n\n✨ <b>Capacidades de IA:</b>\n${aiCmds}` : '';

    const adminHelp = config.TELEGRAM_ALLOWED_USER_IDS.includes(ctx.from?.id) ? 
        `\n\n🛡️ <b>Administración:</b>
• /pagos - Ver pendientes.
• /verificar [ID] - Aprobar pago.
• /sync - Sincronizar Knowledge.` : '';

    const tips = `\n\n💡 <b>Tips:</b>
• Envía PDFs o Word para análisis profundo.
• Usa notas de voz para mayor fluidez.`;

    await ctx.reply(publicHelp + aiHelp + adminHelp + tips, { parse_mode: 'HTML' });
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
    for (const sub of pending) {
        const user = db.prepare('SELECT name, username FROM users WHERE id = ?').get(sub.user_id) as any;
        const name = user?.name || user?.username || `ID:${sub.user_id}`;
        msg += `🆔 Sub ID: <code>${sub.id}</code>\n👤 Usuario: <b>${name}</b>\n💎 Plan: ${sub.plan_id}\n🔗 Ref: <code>${sub.payment_reference || 'N/A'}</code>\n\n`;
    }
    msg += '-------------------\n✍️ Para aprobar: <code>/verificar [Sub ID]</code>';

    await ctx.reply(msg, { parse_mode: 'HTML' });
});

bot.command('verificar', async (ctx) => {
    const adminId = ctx.from?.id;
    if (!adminId || !config.TELEGRAM_ALLOWED_USER_IDS.includes(adminId)) return;

    const subId = parseInt(ctx.match?.trim() || '0');
    if (!subId) return await ctx.reply('Especifique el ID de la suscripción. Ej: /verificar 5');

    const sub = getSubscriptionById(subId);
    if (!sub) return await ctx.reply('❌ Suscripción no encontrada.');

    try {
        verifySubscription(subId, adminId);
        await ctx.reply(`✅ Suscripción #${subId} verificada correctamente.`);

        const stmt = db.prepare('SELECT telegram_id FROM users WHERE id = ?');
        const internalUser = stmt.get(sub.user_id) as any;
        if (internalUser) {
            await ctx.api.sendMessage(internalUser.telegram_id, `🎉 <b>¡Tu plan ${sub.plan_id} ha sido activado!</b>\nYa puedes empezar a usar todas las funcionalidades.`, { parse_mode: 'HTML' });
        }
    } catch (e: any) {
        console.error('Error during verification:', e);
        await ctx.reply(`❌ <b>Error durante la verificación:</b>\n${e.message}`, { parse_mode: 'HTML' });
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
        const responseData = await fetch(fileUrl);
        if (!responseData.ok) throw new Error('Falló la descarga del documento de Telegram');
        
        // @ts-ignore
        await streamPipeline(responseData.body, fs.createWriteStream(localPath));

        let extractedText = '';
        let pages: string[] = [];
        let metadata: any = {};

        if (ext === 'pdf') {
            pages = await extractPagesFromPdf(localPath);
            extractedText = pages.join('\n\n');
            metadata = await extractMetadata(extractedText.substring(0, 5000));
        } else if (ext === 'docx') {
            extractedText = await extractTextFromDocx(localPath);
            metadata = await extractMetadata(extractedText.substring(0, 5000));
            pages = [extractedText];
        }

        if (!extractedText.trim()) {
            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
            return ctx.reply('No pude extraer texto del documento.');
        }

        // Ofrecer guardado persistente con botones inline
        const keyboard = new InlineKeyboard()
            .text("💾 Guardar en Mi Biblioteca", `save_doc:${fileId}`)
            .row()
            .text("🔍 Solo analizar ahora", "skip_save");

        // Almacenar el texto y metadatos temporalmente vinculados al file_id para el callback
        (global as any).tempDocs = (global as any).tempDocs || {};
        (global as any).tempDocs[fileId] = {
            pages: pages,
            metadata,
            fileName
        };

        const metadataInfo = metadata.title && metadata.title !== "Desconocido" 
            ? `📚 <b>${metadata.title}</b>\n✍️ ${metadata.author} (${metadata.year})\n\n` 
            : '';

        await ctx.reply(`He procesado: <b>${fileName}</b>\n\n${metadataInfo}¿Deseas guardarlo permanentemente en tu biblioteca personal para futuras consultas?`, {
            parse_mode: 'HTML',
            reply_markup: keyboard
        });

        const finalPrompt = caption.trim().length > 0 ? `${caption}\n\n--- Documento adjunto (${fileName}) ---\n${extractedText}` : `Por favor analiza este documento (${fileName}):\n\n${extractedText}`;
        
        const MAX_DOC_CHARS = 100000;
        let p = finalPrompt;
        if (p.length > MAX_DOC_CHARS) {
             p = p.substring(0, MAX_DOC_CHARS) + '\n\n... [Texto truncado por límite de longitud]';
             ctx.reply('El documento es muy grande. Solo procesaré las primeras partes del texto.');
        }

        const replyText = await processUserMessage(userId, p);
        await sendLongMessage(ctx, replyText);

        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

    } catch (error: any) {
        console.error('Error procesando documento:', error);
        await ctx.reply(`Error al procesar el documento: ${error.message}`);
    }
});

// Manejador de botones para guardar en biblioteca
bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const user = getUserByTelegramId(ctx.from.id);
    if (!user) return;

    if (data.startsWith("save_doc:")) {
        const fileId = data.split(":")[1];
        const docData = (global as any).tempDocs?.[fileId];

        if (docData) {
            await ctx.answerCallbackQuery({ text: "Guardando en biblioteca..." });
            await ctx.editMessageText(`⌛ Indexando páginas de <b>${docData.fileName}</b>...`, { parse_mode: 'HTML' });

            try {
                // Guardar cada página de forma independiente para búsqueda precisa
                for (let i = 0; i < docData.pages.length; i++) {
                    saveToPersonalLibrary({
                        user_id: user.id,
                        name: docData.fileName,
                        content: docData.pages[i],
                        page_number: i + 1,
                        author: docData.metadata.author || 'Desconocido',
                        year: docData.metadata.year || 'S/F',
                        title: docData.metadata.title || docData.fileName,
                        publisher: docData.metadata.publisher || 'Desconocido'
                    });
                }
                
                await ctx.editMessageText(`✅ <b>${docData.fileName}</b> se ha guardado correctamente. Ahora puedes hacer preguntas sobre su contenido en cualquier momento sin volver a subirlo.`, { parse_mode: 'HTML' });
                delete (global as any).tempDocs[fileId];
            } catch (e) {
                console.error('Error saving to personal library:', e);
                await ctx.editMessageText("❌ Error al guardar en la biblioteca.");
            }
        } else {
            await ctx.answerCallbackQuery({ text: "Error: Los datos han expirado. Por favor, reenvía el archivo." });
        }
    } else if (data === "skip_save") {
        await ctx.answerCallbackQuery({ text: "Análisis temporal completado." });
        await ctx.editMessageText("Documento utilizado solo para la respuesta actual.");
    }
});

bot.on('message:photo', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUserByTelegramId(userId);
    if (!user) {
        return await ctx.reply(`¡Hola! Para usar ${config.BOT_NAME}, primero necesitas registrarte.\n\nUsa /start para elegir un plan.`);
    }

    // 1. Detectar si el usuario está pendiente de pago
    const pendingSub = getUserSubscriptions(user.id).find(s => s.status === 'pending');
    
    // Si tiene una suscripción pendiente, tratamos la foto como un comprobante de pago
    if (pendingSub) {
        const photo = ctx.message.photo.pop(); // El más grande
        if (!photo) return;

        const caption = ctx.message.caption || 'Captura de pantalla (Comprobante)';
        
        // Notificar a los administradores
        const adminMsg = `📸 <b>NUEVO COMPROBANTE RECIBIDO (IMAGEN)</b>\n\n👤 Usuario: <b>${user.name || user.username || userId}</b> (ID: <code>${user.id}</code>)\n💎 Plan solicitado: <b>${pendingSub.plan_id}</b>\n\nUsa /verificar ${pendingSub.id} para aprobar tras revisar la imagen adjunta.`;

        for (const adminId of config.TELEGRAM_ALLOWED_USER_IDS) {
            try {
                await ctx.api.sendPhoto(adminId, photo.file_id, { 
                    caption: adminMsg, 
                    parse_mode: 'HTML' 
                });
            } catch (e) {
                console.error(`Error al enviar foto de pago al admin ${adminId}:`, e);
            }
        }

        // Marcar en la base de datos que ya envió algo (opcional, pero útil)
        db.prepare('UPDATE subscriptions SET payment_reference = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run('IMAGEN_ENVIADA', pendingSub.id);

        return await ctx.reply('✅ <b>¡Comprobante recibido!</b>\nMi administrador ya ha recibido la imagen en su chat privado y validará tu pago pronto. ¡Muchas gracias!');
    }

    // Si NO está pendiente, de momento ignoramos la foto (o podrías añadir OCR/análisis luego)
    await ctx.reply('Recibí tu foto. Por ahora solo puedo procesar texto y documentos PDF/Word para consultas, pero guardaré esto en mi memoria.');
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
    const userId = ctx.from.id;
    const user = getUserByTelegramId(userId);

    if (config.capabilities.commands && config.capabilities.commands[cmdName] !== undefined) {
        if (config.capabilities.commands[cmdName] === true) {
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
                const tool = getTool(cmdName);
                
                let instruction = `El usuario ha enviado el comando "/${cmdName}". ${extraText}`;
                
                if (tool) {
                    instruction = `[INSTRUCCIÓN CRÍTICA DE EJECUCIÓN]
El usuario ha activado el comando "/${cmdName}". 
1. DEBES verificar si tienes una herramienta (función) llamada "${cmdName}".
2. Si la tienes, DEBES EJECUTARLA de inmediato para obtener datos reales o realizar la acción.
3. No inventes datos ni des una descripción teórica si existe una herramienta. Usa el resultado de la herramienta para tu respuesta.
4. Si el resultado de la herramienta es una tabla, un reporte tabular o contiene bloques de código, DEBES respetarlos íntegramente. No conviertas informes técnicos en prosa narrativa a menos que el usuario lo pida específicamente.
5. Responde al final de forma breve y profesional basada en los resultados finales.

Contexto adicional: "${extraText}"`;
                } else {
                    instruction = `[INSTRUCCIÓN DE CAPACIDAD INTERNA]
Has recibido el comando "/${cmdName}".
1. Esta es una capacidad lingüística y analítica NATIVA de tu modelo.
2. Ejecuta la tarea solicitada (redacción, síntesis, corrección, etc.) sobre el texto del usuario de inmediato.
3. NO menciones que no tienes herramientas; tú eres la herramienta para este proceso.

Contexto adicional: "${extraText}"`;
                }
                
                const replyText = await processUserMessage(userId, instruction);
                await sendLongMessage(ctx, replyText);

                if (memory.getAudioMode(userId) === 'voice') {
                    const audioPath = await generateSpeech(replyText);
                    if (audioPath) {
                        await ctx.replyWithVoice(new InputFile(audioPath));
                        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
                    }
                }
                if (!replyText.includes("Sin respuesta del modelo.") && !replyText.includes("Lo siento, alcancé el límite")) {
                    incrementUsage(user.id);
                }
            } catch (error: any) {
                console.error(`Error procesando comando dinámico ${cmdName}:`, error);
                if (error.message.includes('servidores')) {
                    await ctx.reply(`⚠️ ${error.message}`);
                } else {
                    await ctx.reply(`❌ Error procesando comando: ${error.message}`);
                }
            }
        } else {
            // Verificar si es un comando de Workflow
            const workflowResponse = await executeWorkflowIfMatches(userId, text);
            if (workflowResponse) {
                return await sendLongMessage(ctx, workflowResponse);
            }
            
            await ctx.reply('🔒 Este comando no está habilitado en mi configuración actual (plan/versión).');
        }
    } else {
        // También verificar workflows para comandos no definidos en capabilities
        const workflowResponse = await executeWorkflowIfMatches(userId, text);
        if (workflowResponse) {
            return await sendLongMessage(ctx, workflowResponse);
        }


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
         
         // Notificar a los administradores
         const adminMsg = `💰 <b>Nueva Referencia de Pago</b>\n\n👤 Usuario: <b>${user.name || user.username || userId}</b> (ID: <code>${user.id}</code>)\n💎 Plan: <b>${pendingSub.plan_id}</b>\n🔗 Referencia: <code>${text.toUpperCase()}</code>\n\nUsa /pagos para ver la lista completa o /verificar ${pendingSub.id} para aprobar.`;
         
         for (const adminId of config.TELEGRAM_ALLOWED_USER_IDS) {
             try {
                 await ctx.api.sendMessage(adminId, adminMsg, { parse_mode: 'HTML' });
             } catch (e) {
                 console.error(`Error al notificar pago al administrador ${adminId}:`, e);
             }
         }

         return await ctx.reply('✅ <b>Gracias por enviar tu comprobante/referencia.</b>\nMi administrador ya ha sido notificado y verificará el pago a la brevedad.');
    }

    incrementUsage(user.id);
    await ctx.replyWithChatAction('typing');

    let warningPrefix = '';
    if (limit.nearLimit && limit.remaining !== -1) {
        const percentageFormatted = (limit.usagePercentage * 100).toFixed(0);
        warningPrefix = `⚠️ <b>AVISO DE LÍMITE:</b> Has consumido el ${percentageFormatted}% de tu plan mensual. Te quedan ${limit.remaining} mensajes. Considera recargar pronto.\n\n`;
    }

     let replyText = '';
     try {
         replyText = await processUserMessage(userId, text);
         
         if (replyText.includes("Sin respuesta del modelo.") || replyText.includes("Lo siento, alcancé el límite")) {
             decrementUsage(user.id);
         }

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
        decrementUsage(user.id);
        console.error('Error al procesar mensaje:', error);
        if (error.message.includes('servidores')) {
            await ctx.reply(`⚠️ ${error.message}`);
        } else {
                await ctx.reply(`❌ Error procesando solicitud: ${error.message}`);
        }
    }
});

async function registerCommands() {
    try {
        // 1. Comandos para TODOS los usuarios
        const publicCommands = [
            { command: 'start', description: '🚀 Inicia tu aventura' },
            { command: 'ayuda', description: '❓ Capacidades y Ayuda' },
            { command: 'reset', description: '🧹 Limpiar Contexto' },
            { command: 'about', description: '🏢 Sobre SynergIA' },
            { command: 'audio', description: '🎙️ Configura Voz/Texto' }
        ];

        // 2. Comandos de IA dinámicos (basados en capabilities)
        const commandLabels: { [key: string]: string } = {
            'buscar_paper': '🔎 Buscar Papers',
            'citar': '📚 Generar Cita',
            'mejorar_redaccion': '✍️ Mejorar Redacción',
            'corregir': '✅ Corregir Texto',
            'parafrasear': '🔄 Parafrasear',
            'resumir': '📝 Resumir Punto',
            'teorizar': '🧠 Teorizar',
            'bots_report': '📊 Informe de Bots de SynergIA'
        };

        const aiCommands = Object.keys(config.capabilities.commands || {})
            .filter(cmd => config.capabilities.commands[cmd] === true && cmd !== 'about')
            .map(cmd => ({
                command: cmd,
                description: commandLabels[cmd] || `🪄 ${cmd.replace(/_/g, ' ')}`
            }));

        // 3. Comandos SOLO para ADMINISTRADORES
        const adminCommands = [
            ...publicCommands,
            ...aiCommands,
            { command: 'agenda', description: '📅 Mi Agenda (Mail y Calendario)' },
            { command: 'pagos', description: '💰 Ver pagos pendientes' },
            { command: 'verificar', description: '✅ Verificar un pago' },
            { command: 'sync', description: '🔄 Sincronizar Knowledge' }
        ];

        // Borrar comandos previos
        await bot.api.deleteMyCommands();

        // Aplicar comandos públicos por defecto
        await bot.api.setMyCommands([...publicCommands, ...aiCommands]);
        console.log('✅ Comandos públicos registrados.');

        // Aplicar menú extendido para cada administrador
        for (const adminId of config.TELEGRAM_ALLOWED_USER_IDS) {
            try {
                await bot.api.setMyCommands(adminCommands, {
                    scope: { type: 'chat', chat_id: adminId }
                });
                console.log(`✅ Menú de administrador configurado para: ${adminId}`);
            } catch (e) {
                console.error(`Error configurando menú admin para ${adminId}:`, e);
            }
        }

    } catch (e) {
        console.error('Error al registrar comandos:', e);
    }
}

bot.start({
    onStart: (botInfo) => {
        console.log(`🤖 @${botInfo.username} en línea.`);
        registerCommands();
    }
});

