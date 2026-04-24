import { Composer, InputFile, InlineKeyboard } from 'grammy';
import { config } from '../../config/index.js';
import { processUserMessage } from '../../agent/loop.js';
import { transcribeAudio } from '../../agent/transcription.js';
import { generateSpeech } from '../../agent/tts.js';
import { 
    extractTextFromPdf, 
    extractTextFromDocx, 
    extractPagesFromPdf, 
    extractMetadata 
} from '../../agent/document.js';
import { memory } from '../../memory/history.js';
import { 
    getUserByTelegramId, 
    checkUserLimit,
    incrementUsage,
    getUserSubscriptions,
    updateUserPlan,
    updateUserStatus,
    updateUserExpiration,
    updateUserMetadata,
    db
} from '../../memory/db.js';
import { sendLongMessage } from '../utils.js';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';

const streamPipeline = promisify(pipeline);
export const messages = new Composer();

messages.on('message', async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return await next();
    
    const user = getUserByTelegramId(userId);
    if (!user) return await next();

    if (user.status === 'esperando_tarea') {
        const metadataStr = (user as any).metadata;
        const metadata = metadataStr ? JSON.parse(metadataStr) : { nombre: user.name || 'Desconocido', cedula: 'N/A', seccion: 'N/A' };
        
        let header = `📚 <b>NUEVA TAREA ENTREGADA</b>\n`;
        header += `👤 Alumno: <b>${metadata.nombre}</b>\n`;
        header += `🆔 CI: <code>${metadata.cedula}</code>\n`;
        header += `📍 Sección: <b>${metadata.seccion}</b>\n\n`;

        await ctx.reply('✅ He recibido tu tarea y se la he enviado al profesor.', { reply_to_message_id: ctx.message?.message_id });
        updateUserStatus(user.id, 'active');

        // Forward this message to admins
        for (const adminId of config.TELEGRAM_ALLOWED_USER_IDS) {
            try {
                await ctx.api.sendMessage(adminId, header, { parse_mode: 'HTML' });
                await ctx.forwardMessage(adminId);
            } catch (e) {
                console.error("Error forwarding task", e);
            }
        }
        return; // Detener propagación
    }
    
    return await next();
});

messages.on('message:document', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUserByTelegramId(userId);
    if (!user) return;
    
    const limit = checkUserLimit(userId);
    if (!limit.allowed) return;

    const document = ctx.message.document;
    const fileId = document.file_id;
    let fileName = document.file_name || 'document';
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    if (ext !== 'pdf' && ext !== 'docx') {
        return ctx.reply('Solo PDF y Word (.docx).');
    }

    incrementUsage(user.id);
    await ctx.replyWithChatAction('typing');

    try {
        const file = await ctx.api.getFile(fileId);
        const tempDir = path.resolve(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

        const localPath = path.resolve(tempDir, `doc_${Date.now()}.${ext}`);
        const fileUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        const responseData = await fetch(fileUrl);
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

        (global as any).tempDocs = (global as any).tempDocs || {};
        (global as any).tempDocs[fileId] = { pages, metadata, fileName };

        const keyboard = new InlineKeyboard()
            .text("💾 Guardar en Biblioteca", `save_doc:${fileId}`)
            .row()
            .text("🔍 Solo analizar", "skip_save");

        await ctx.reply(`He procesado <b>${fileName}</b>. ¿Deseas guardarlo?`, {
            parse_mode: 'HTML',
            reply_markup: keyboard
        });

        const replyText = await processUserMessage(userId, `Analiza: ${extractedText.substring(0, 5000)}`);
        await sendLongMessage(ctx, replyText);

        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    } catch (error: any) {
        console.error(error);
    }
});

messages.on('message:photo', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUserByTelegramId(userId);
    if (!user) return;

    const pendingSub = getUserSubscriptions(user.id).find(s => s.status === 'pending');
    if (pendingSub) {
        const photo = ctx.message.photo.pop();
        if (!photo) return;

        const adminMsg = `📸 <b>NUEVO COMPROBANTE</b>\n👤 Usuario: ${user.name || userId}\n🆔 Sub: ${pendingSub.id}`;
        for (const adminId of config.TELEGRAM_ALLOWED_USER_IDS) {
            await ctx.api.sendPhoto(adminId, photo.file_id, { caption: adminMsg, parse_mode: 'HTML' });
        }

        db.prepare('UPDATE subscriptions SET payment_reference = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run('IMAGEN_ENVIADA', pendingSub.id);

        return await ctx.reply('✅ Comprobante recibido.');
    }
});

messages.on(['message:voice', 'message:audio'], async (ctx) => {
    const userId = ctx.from.id;
    const user = getUserByTelegramId(userId);
    if (!user) return;
    
    const limit = checkUserLimit(userId);
    if (!limit.allowed) return;

    const file = await ctx.getFile();
    const tempDir = path.resolve(process.cwd(), 'temp');
    const localPath = path.resolve(tempDir, `voice_${Date.now()}.ogg`);

    incrementUsage(user.id);
    await ctx.replyWithChatAction('typing');

    try {
        const fileUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        const response = await fetch(fileUrl);
        // @ts-ignore
        await streamPipeline(response.body, fs.createWriteStream(localPath));

        const transcribedText = await transcribeAudio(localPath);
        const replyText = await processUserMessage(userId, transcribedText);
        await sendLongMessage(ctx, replyText);

        if (memory.getAudioMode(user.id) === 'voice') {
            const audioPath = await generateSpeech(replyText);
            if (audioPath) {
                await ctx.replyWithVoice(new InputFile(audioPath));
                if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            }
        }
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    } catch (error: any) {
        console.error(error);
    }
});

messages.on('message:text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const user = getUserByTelegramId(userId);
    if (!user) return;

    if (process.env.INSTANCE_ID === 'estadistica' && user.status === 'registro') {
        const isProfessor = config.TELEGRAM_ALLOWED_USER_IDS.includes(userId);
        if (isProfessor) {
            updateUserStatus(user.id, 'active');
            updateUserPlan(user.id, 'premium');
            // Continuar al flujo normal de mensajes
        } else {
            const textClean = text || '';
        if (textClean.length > 5) {
            let auth = false;
            let matchedStudent: any = null;
            try {
                const dataPath = path.resolve(process.cwd(), 'src/data/alumnos.json');
                if (fs.existsSync(dataPath)) {
                    const alumnos = JSON.parse(fs.readFileSync(dataPath, 'utf-8')).alumnos;
                    
                    // Normalizar entrada del usuario (solo números)
                    const inputDigits = textClean.replace(/\D/g, '');
                    
                    if (inputDigits.length >= 6) {
                        matchedStudent = alumnos.find((a: any) => {
                            // Normalizar cédula del JSON (solo números)
                            const studentDigits = a.cedula.replace(/\D/g, '');
                            return inputDigits.includes(studentDigits) || studentDigits.includes(inputDigits);
                        });
                        if (matchedStudent) auth = true;
                    }
                }
            } catch(e) {
                console.error("Error validando alumnos.json", e);
            }
            
            if (auth) {
                updateUserPlan(user.id, 'premium');
                updateUserStatus(user.id, 'active');
                updateUserExpiration(user.id, '2026-07-20T23:59:59.000Z');
                if (matchedStudent) {
                    updateUserMetadata(user.id, JSON.stringify(matchedStudent));
                }
                return await ctx.reply("✨ <b>Validación exitosa</b>.\n\n¡Bienvenido a la tutoría! Tu acceso premium se ha habilitado y será válido hasta el final del semestre (20/07/2026).\n\n¿En qué módulo necesitas ayuda hoy?", { parse_mode: 'HTML' });
            } else {
                await ctx.reply("⚠️ No logro ubicar tu cédula en el registro de mis secciones.\n\nHe reenviado tu mensaje directamente al profesor para que él revise tu caso. Por favor, espera su indicación.");
                const profMsg = `📩 <b>INTENTO DE REGISTRO NO VÁLIDO</b>\n\nUsuario: ${ctx.from.first_name} (@${ctx.from.username || 'sin_usuario'})\nID: <code>${userId}</code>\n\nMensaje enviado:\n<i>"${textClean}"</i>\n\n📝 Si deseas autorizarlo, añade su cédula al archivo <code>src/data/alumnos.json</code> y pídele que envíe el recado nuevamente.`;
                for (const adminId of config.TELEGRAM_ALLOWED_USER_IDS) {
                    try {
                        await ctx.api.sendMessage(adminId, profMsg, { parse_mode: 'HTML' });
                    } catch (e) {
                        console.error("Error enviando mensaje al admin", e);
                    }
                }
                return;
            }
        } else {
            return await ctx.reply("Por favor, escribe tus datos completos (incluyendo número de cédula).");
        }
    }
}

    const limit = checkUserLimit(userId);
    if (!limit.allowed) return;

    incrementUsage(user.id);
    await ctx.replyWithChatAction('typing');
    const replyText = await processUserMessage(userId, text || '');
    await sendLongMessage(ctx, replyText);

    if (memory.getAudioMode(user.id) === 'voice') {
        const audioPath = await generateSpeech(replyText);
        if (audioPath) {
            await ctx.replyWithVoice(new InputFile(audioPath));
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        }
    }
});
