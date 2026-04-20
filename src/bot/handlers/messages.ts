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
    db
} from '../../memory/db.js';
import { sendLongMessage } from '../utils.js';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';

const streamPipeline = promisify(pipeline);
export const messages = new Composer();

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

        if (memory.getAudioMode(userId) === 'voice') {
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

    const limit = checkUserLimit(userId);
    if (!limit.allowed) return;

    incrementUsage(user.id);
    await ctx.replyWithChatAction('typing');
    const replyText = await processUserMessage(userId, text || '');
    await sendLongMessage(ctx, replyText);

    if (memory.getAudioMode(userId) === 'voice') {
        const audioPath = await generateSpeech(replyText);
        if (audioPath) {
            await ctx.replyWithVoice(new InputFile(audioPath));
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        }
    }
});
