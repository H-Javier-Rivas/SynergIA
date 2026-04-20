import { Composer } from 'grammy';
import { config } from '../../config/index.js';
import { 
    getUserByTelegramId, 
    getPlan, 
    getAllPlans,
    checkUserLimit,
    deleteUserComplete,
    restoreUserComplete,
    getPendingSubscriptions,
    getSubscriptionById,
    verifySubscription,
    db
} from '../../memory/db.js';
import { memory } from '../../memory/history.js';
import { syncLibrary } from '../../agent/library.js';
import { cleanHtml } from '../utils.js';

export const commands = new Composer();

commands.command('start', async (ctx) => {
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

    await ctx.reply(welcomeMessage, { parse_mode: 'HTML', ...planKeyboard });
});

commands.command('reset', async (ctx) => {
    if (ctx.from) {
        await memory.clearHistory(ctx.from.id);
        await ctx.reply('✅ Historial borrado. Empecemos de nuevo.');
    }
});

commands.command('hardreset', async (ctx) => {
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

commands.command('restore', async (ctx) => {
    if (ctx.from) {
        try {
            const success = restoreUserComplete(ctx.from.id);
            if (success) {
                await memory.clearHistory(ctx.from.id);
                await ctx.reply('✅ <b>RESTAURACIÓN COMPLETADA</b> ✅\n\nTu perfil, historial y configuración han sido restaurados desde el último respaldo.', { parse_mode: 'HTML' });
            } else {
                await ctx.reply('❌ No se encontró un respaldo válido.');
            }
        } catch (error) {
            console.error('Error in restore command:', error);
            await ctx.reply('❌ Error técnico al intentar restaurar los datos.');
        }
    }
});

commands.command('audio', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.match?.trim().toLowerCase();

    if (!args) {
        const currentMode = memory.getAudioMode(userId);
        const modeDesc = currentMode === 'voice' ? '🎙️ Voz' : currentMode === 'text' ? '✍️ Texto' : '🔇 Desactivado';
        return await ctx.reply(`🔊 Modo de audio actual: <b>${modeDesc}</b>\n\nUsa '/audio voz', '/audio texto' o '/audio off' para cambiarlo.`, { parse_mode: 'HTML'});
    }

    if (args === 'voz' || args === 'voice') {
        memory.setAudioMode(userId, 'voice');
        await ctx.reply('🎙️ Modo de audio configurado a: <b>Voz</b>.', { parse_mode: 'HTML'});
    } else if (args === 'texto' || args === 'text' || args === '--texto') {
        memory.setAudioMode(userId, 'text');
        await ctx.reply('✍️ Modo de audio configurado a: <b>Texto</b>.', { parse_mode: 'HTML'});
    } else if (args === 'off' || args === 'desactivar') {
        memory.setAudioMode(userId, 'off');
        await ctx.reply('🔇 Modo de audio configurado a: <b>Desactivado</b>.', { parse_mode: 'HTML'});
    } else {
        await ctx.reply("❌ Opción no válida. Usa 'voz', 'texto' o 'off'.");
    }
});

commands.command('sync', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!config.GOOGLE_DRIVE_FOLDER_ID) {
        return await ctx.reply('❌ No hay una carpeta de Google Drive configurada.');
    }

    const initialMsg = await ctx.reply('🔄 Iniciando sincronización de biblioteca...');
    
    try {
        await syncLibrary(async (msg) => {
             // Throttled update could be added here if needed
        });
        await ctx.api.editMessageText(ctx.chat.id, initialMsg.message_id, '✅ <b>¡Sincronización completada!</b>', { parse_mode: 'HTML' });
    } catch (e: any) {
        console.error('Error en /sync:', e);
        await ctx.reply(`❌ <b>Error durante la sincronización:</b>\n${e.message}`, { parse_mode: 'HTML' });
    }
});

commands.command('pagos', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !config.TELEGRAM_ALLOWED_USER_IDS.includes(userId)) return;

    const pending = getPendingSubscriptions();
    if (pending.length === 0) {
        return await ctx.reply('✅ No hay pagos pendientes.');
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

commands.command('verificar', async (ctx) => {
    const adminId = ctx.from?.id;
    if (!adminId || !config.TELEGRAM_ALLOWED_USER_IDS.includes(adminId)) return;

    const subId = parseInt(ctx.match?.trim() || '0');
    if (!subId) return await ctx.reply('Especifique el ID de la suscripción.');

    try {
        verifySubscription(subId, adminId);
        await ctx.reply(`✅ Suscripción #${subId} verificada.`);
    } catch (e: any) {
        await ctx.reply(`❌ Error: ${e.message}`);
    }
});
