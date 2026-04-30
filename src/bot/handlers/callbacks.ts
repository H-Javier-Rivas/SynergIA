import { Composer } from 'grammy';
import { config } from '../../config/index.js';
import { 
    getUserByTelegramId, 
    createUser, 
    getPlan, 
    updateUserPlan,
    updateUserStatus,
    createPendingSubscription,
    saveToPersonalLibrary
} from '../../memory/db.js';
import { cleanHtml } from '../utils.js';

export const callbacks = new Composer();

callbacks.callbackQuery(/plan_(.+)/, async (ctx) => {
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
    }

    paymentMsg += `📎 <b>IMPORTANTE:</b> Envía una captura del comprobante aquí mismo.\nTu cuenta será activada una vez verificado el pago.`;

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

callbacks.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const user = getUserByTelegramId(ctx.from.id);
    if (!user || !data) return;

    if (data.startsWith("save_doc:")) {
        const fileHash = data.split(":")[1];
        const docData = (global as any).tempDocs?.[fileHash];

        if (docData) {
            const { fileId, pages, metadata, fileName } = docData;
            await ctx.answerCallbackQuery({ text: "Guardando en biblioteca..." });
            await ctx.editMessageText(`⌛ Indexando páginas de <b>${fileName}</b>...`, { parse_mode: 'HTML' });

            try {
                for (let i = 0; i < pages.length; i++) {
                    saveToPersonalLibrary({
                        user_id: user.id,
                        name: fileName,
                        content: pages[i],
                        page_number: i + 1,
                        author: metadata.author || 'Desconocido',
                        year: metadata.year || 'S/F',
                        title: metadata.title || fileName,
                        publisher: metadata.publisher || 'Desconocido'
                    });
                }
                
                await ctx.editMessageText(`✅ <b>${fileName}</b> se ha guardado correctamente.`, { parse_mode: 'HTML' });
                delete (global as any).tempDocs[fileHash];
            } catch (e) {
                console.error('Error saving to personal library:', e);
                await ctx.editMessageText("❌ Error al guardar en la biblioteca.");
            }
        } else {
            await ctx.answerCallbackQuery({ text: "Error: Los datos han expirado." });
        }
    } else if (data === "skip_save") {
        await ctx.answerCallbackQuery({ text: "Análisis temporal completado." });
        await ctx.editMessageText("Documento utilizado solo para la respuesta actual.");
    }
});
