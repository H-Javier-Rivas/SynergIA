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
    createUser,
    updateUserStatus,
    updateUserPlan,
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
    const isProfessor = config.TELEGRAM_ALLOWED_USER_IDS.includes(userId);

    // 1. Lógica para el Profesores/Administradores
    if (isProfessor) {
        if (!user) {
            createUser({
                telegram_id: userId,
                agent_id: process.env.INSTANCE_ID,
                plan: 'premium',
                status: 'active',
                name: userName,
                username: ctx.from?.username
            });
        } else {
            updateUserPlan(user.id, 'premium');
            updateUserStatus(user.id, 'active');
        }

        const professorWelcome = `
¡Bienvenido de nuevo, <b>Profesor</b>! 🎓👋

He sincronizado sus permisos de administrador y todas las funciones avanzadas están desbloqueadas. 

Usted tiene acceso ilimitado para:
• Generar ejercicios y material de clase.
• Corregir y analizar documentos académicos.
• Supervisar los intentos de registro de sus alumnos.

¿En qué puedo apoyarle hoy con la materia de <b>Estadística</b>?
`.trim();
        return await ctx.reply(professorWelcome, { parse_mode: 'HTML' });
    }

    // 2. Lógica para Estudiantes (Modo Estadística)
    if (process.env.INSTANCE_ID === 'estadistica') {
        if (user && user.plan === 'premium') {
            return await ctx.reply(`¡Bienvenido de nuevo a la tutoría, <b>${userName}</b>! 👋\n\nTu acceso se encuentra activo. ¿En qué módulo necesitas ayuda hoy?`, { parse_mode: 'HTML' });
        }
        
        if (!user) {
            createUser({
                telegram_id: userId,
                agent_id: process.env.INSTANCE_ID,
                plan: 'free',
                status: 'registro',
                name: userName,
                username: ctx.from?.username
            });
        } else {
            updateUserStatus(user.id, 'registro');
        }

        const msg = `¡Hola! 👋 Soy <b>${config.BOT_NAME}</b>, tu tutor de estadística.\n\nPara tener acceso completo a la plataforma, por favor escribe en un <b>solo mensaje</b> tu: Nombre, Apellido, Cédula de Identidad y Sección de clase.`;
        return await ctx.reply(msg, { parse_mode: 'HTML' });
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
        const user = getUserByTelegramId(ctx.from.id);
        if (user) await memory.clearHistory(user.id);
        await ctx.reply('✅ Historial borrado. Empecemos de nuevo.');
    }
});

commands.command('hardreset', async (ctx) => {
    if (ctx.from) {
        try {
            const user = getUserByTelegramId(ctx.from.id);
            if (user) await memory.clearHistory(user.id);
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
                const user = getUserByTelegramId(ctx.from.id);
                if (user) await memory.clearHistory(user.id);
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

    const user = getUserByTelegramId(userId);
    if (!user) return;

    const args = ctx.match?.trim().toLowerCase();

    if (!args) {
        const currentMode = memory.getAudioMode(user.id);
        const modeDesc = currentMode === 'voice' ? '🎙️ Voz' : currentMode === 'text' ? '✍️ Texto' : '🔇 Desactivado';
        return await ctx.reply(`🔊 Modo de audio actual: <b>${modeDesc}</b>\n\nUsa '/audio voz', '/audio texto' o '/audio off' para cambiarlo.`, { parse_mode: 'HTML'});
    }

    if (args === 'voz' || args === 'voice') {
        memory.setAudioMode(user.id, 'voice');
        await ctx.reply('🎙️ Modo de audio configurado a: <b>Voz</b>.', { parse_mode: 'HTML'});
    } else if (args === 'texto' || args === 'text' || args === '--texto') {
        memory.setAudioMode(user.id, 'text');
        await ctx.reply('✍️ Modo de audio configurado a: <b>Texto</b>.', { parse_mode: 'HTML'});
    } else if (args === 'off' || args === 'desactivar') {
        memory.setAudioMode(user.id, 'off');
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

commands.command('entregar_tarea', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const user = getUserByTelegramId(userId);
    if (!user) return;

    if (process.env.INSTANCE_ID !== 'estadistica') {
        return await ctx.reply("❌ Este comando solo está disponible en la asignatura estadística.");
    }

    const isProfessor = config.TELEGRAM_ALLOWED_USER_IDS.includes(userId);
    if (isProfessor) {
        return await ctx.reply("Usted es el profesor registrado. No necesita este comando.");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(user as any).metadata) {
        return await ctx.reply("❌ No encontramos tu identificación completa en la base de datos. Por favor, asegúrate de estar registrado en la lista dictada por el profesor.");
    }

    updateUserStatus(user.id, 'esperando_tarea');
    const msg = `📚 <b>Modo Entrega de Tarea Activado</b>\n\nPor favor, en tu próximo mensaje envía la tarea. Puedes:\n• Adjuntar un archivo PDF o Word.\n• Enviar una foto.\n• Escribir el texto directamente.\n\n<i>Cualquier cosa que envíes será reenviada al profesor junto con tus datos.</i>`;
    
    await ctx.reply(msg, { parse_mode: 'HTML' });
});

commands.command(['manual', 'ayuda', 'help'], async (ctx) => {
    const manualMsg = `
📖 <b>MANUAL DE USO: TUTOR DE ESTADÍSTICA</b> 📖

Soy tu asistente de Inteligencia Artificial para la asignatura de Estadística. Mi objetivo <b>no es darte las respuestas directas</b>, sino guiarte paso a paso como un tutor pedagógico para que aprendas el procedimiento.

💡 <b>¿CÓMO UTILIZARME?</b>

💬 <b>1. Enviar Preguntas:</b> 
Simplemente escríbeme cualquier duda sobre fórmulas, conceptos o ejercicios. 
<i>Tip: Si envías una nota de voz, yo también te responderé por voz (si tienes el modo activo).</i>

📄 <b>2. Analizar Documentos:</b> 
Puedes enviarme archivos <b>PDF</b> o documentos de <b>Word (.docx)</b>. Yo los leeré y luego podrás preguntarme sobre ellos.
<i>Ejemplo: Pásame una guía y pregúntame "¿Puedes explicarme el segundo ejercicio de la página 3?".</i>

⚙️ <b>3. Configuración de Audios:</b>
Usa el comando <code>/audio</code> para definir cómo quieres que te responda.
• <code>/audio voz</code>: Te responderé con notas de voz interactivas.
• <code>/audio texto</code>: Te responderé solo con mensajes y emojis.

📝 <b>4. Entrega de Tareas:</b>
Cuando el profesor lo solicite, usa el comando <code>/entregar_tarea</code>.
El bot entrará en modo de entrega y podrás enviar tu archivo, foto o texto, el cual será remitido <b>directamente al profesor</b> junto con tu cédula y nombre registrado.

🔄 <b>Otros comandos útiles:</b>
• <code>/start</code> - Iniciar el menú principal y/o validar tu registro.
• <code>/reset</code> - Si la conversación se ha desviado mucho, usa esto para limpiar la "memoria a corto plazo" y que empecemos un tema nuevo desde cero.

<i>¡Recuerda que estoy aquí para ayudarte a comprender a fondo la estadística de forma académica!</i>🎓
`.trim();

    await ctx.reply(manualMsg, { parse_mode: 'HTML' });
});
