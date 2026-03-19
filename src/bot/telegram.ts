import { Bot, InputFile } from 'grammy';
import { config } from '../config/index.js';
import { processUserMessage } from '../agent/loop.js';
import { transcribeAudio } from '../agent/transcription.js';
import { generateSpeech } from '../agent/tts.js';
import { extractTextFromPdf, extractTextFromDocx } from '../agent/document.js';
import { memory } from '../memory/history.js';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';

const streamPipeline = promisify(pipeline);
export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Middleware: Whitelist de usuarios (Seguridad Primero)
bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;

    if (!userId) {
        console.warn('Mensaje ignorado: No se pudo determinar el ID del usuario.');
        return;
    }

    if (!config.TELEGRAM_ALLOWED_USER_IDS.includes(userId)) {
        console.warn(`Mensaje ignorado: Usuario no autorizado (ID: ${userId}).`);
        return;
    }

    await next();
});

// Comandos
bot.command('start', async (ctx) => {
    await ctx.reply('¡Hola! Soy SynergIA, tu agente personal. ¿En qué te puedo ayudar hoy?');
});

bot.command('reset', async (ctx) => {
    if (ctx.from) {
        await memory.clearHistory(ctx.from.id);
        await ctx.reply('✅ Historial borrado. Empecemos de nuevo.');
    }
});

bot.command('help', async (ctx) => {
    await showHelp(ctx);
});

// Captura específicamente la variante "/?" (que no es un comando válido para Telegram pero es común)
bot.hears(/^\/\?$/, async (ctx) => {
    await showHelp(ctx);
});

async function showHelp(ctx: any) {
    const helpMessage = `
🤖 *Comandos de SynergIA:*

/start \- Iniciar el bot y recibir saludo.
/reset \- Borrar el historial de la conversación actual.
/audio \- Ver el modo actual de respuesta de audio.
/audio voz \- Activar respuestas con mensajes de voz.
/audio \-\-texto \- Responder solo con texto (modo por defecto).
/audio off \- Desactivar todas las respuestas de audio.
/help o /? \- Ver esta lista de ayuda.

*Tips:* 
• Puedes enviarme PDFs o archivos Word para que los analice.
• Puedes enviarme mensajes de voz y te responderé según tu configuración de /audio.
    `;
    await ctx.reply(helpMessage, { parse_mode: 'MarkdownV2' });
}


bot.command('audio', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.match?.trim().toLowerCase();

    if (!args) {
        const currentMode = memory.getAudioMode(userId);
        return await ctx.reply(`🔊 Modo de audio actual: *${currentMode}*\n\nUsa '/audio voz', '/audio --texto' o '/audio off' para cambiarlo.`, { parse_mode: 'Markdown' });
    }

    if (args === 'voz' || args === 'voice') {
        memory.setAudioMode(userId, 'voice');
        await ctx.reply('🎙️ Modo de audio configurado a: *Voz*. Ahora te responderé con mensajes de audio.', { parse_mode: 'Markdown' });
    } else if (args === '--texto' || args === 'texto' || args === 'text') {
        memory.setAudioMode(userId, 'text');
        await ctx.reply('✍️ Modo de audio configurado a: *Texto*. Responderé solo con mensajes escritos.', { parse_mode: 'Markdown' });
    } else if (args === 'off') {
        memory.setAudioMode(userId, 'off');
        await ctx.reply('🔇 Modo de audio configurado a: *Desactivado*.', { parse_mode: 'Markdown' });
    } else {
        await ctx.reply("❌ Opción no válida. Usa 'voz', '--texto' o 'off'.");
    }
});


// Manejador de documentos
bot.on('message:document', async (ctx) => {
    const userId = ctx.from.id;
    const document = ctx.message.document;
    const fileId = document.file_id;
    let fileName = document.file_name || 'documento_desconocido';
    const caption = ctx.message.caption || ''; // Lo que el usuario escribió junto al documento
    
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    if (ext !== 'pdf' && ext !== 'docx') {
        return ctx.reply('Lo siento, de momento solo puedo procesar archivos PDF y Word (.docx).');
    }

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

        // Limpiar el archivo temporal
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

        // Preparamos el mensaje para el LLM. Ej: "Comenta su contenido \n\n --- Contenido del documento --- \n [TEXTO]"
        let finalPrompt = '';
        if (caption.trim().length > 0) {
            finalPrompt = `${caption}\n\n--- Documento adjunto (${fileName}) ---\n${extractedText}`;
        } else {
            finalPrompt = `Por favor analiza este documento (${fileName}):\n\n${extractedText}`;
        }
        
        // Truncar si el documento es absurda y groseramente largo (esto previene pasarse del context window masivamente, 
        // aunque Llama-3 de groq soporta mucho, es buena práctica)
        const MAX_DOC_CHARS = 100000;
        if (finalPrompt.length > MAX_DOC_CHARS) {
             finalPrompt = finalPrompt.substring(0, MAX_DOC_CHARS) + '\n\n... [Texto truncado por límite de longitud]';
             ctx.reply('El documento es muy grande. Solo procesaré las primeras partes del texto.');
        }

        const replyText = await processUserMessage(userId, finalPrompt);
        await sendLongMessage(ctx, replyText);

        // Responder también con voz solo si está activado
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

// Manejador de voz/audio
bot.on(['message:voice', 'message:audio'], async (ctx) => {
    const userId = ctx.from.id;
    const file = await ctx.getFile();
    const filePath = file.file_path;
    
    if (!filePath) return;

    const tempDir = path.resolve(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    let ext = filePath.split('.').pop() || 'ogg';
    // Telegram usa .oga para mensajes de voz, pero Groq prefiere .ogg para reconocer el formato
    if (ext === 'oga') ext = 'ogg';

    const localPath = path.resolve(tempDir, `voice_${Date.now()}.${ext}`);

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

        // Responder también con voz solo si está activado
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

// Función auxiliar para dividir mensajes largos
async function sendLongMessage(ctx: any, text: string) {
    const MAX_LENGTH = 4090;
    if (text.length <= MAX_LENGTH) {
        return await ctx.reply(text);
    }

    const chunks = [];
    let currentText = text;

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
        await ctx.reply(chunk);
    }
}

// Manejador principal de mensajes
bot.on('message:text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    await ctx.replyWithChatAction('typing');

    try {
        const replyText = await processUserMessage(userId, text);
        await sendLongMessage(ctx, replyText);

        // Responder también con voz solo si está activado
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
