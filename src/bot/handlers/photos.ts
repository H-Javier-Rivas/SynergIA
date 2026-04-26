/**
 * @module bot/handlers/photos
 * @description Handler dedicado para mensajes con imágenes (fotos) en Telegram.
 *
 * Flujo:
 *  1. Si el usuario está en estado 'esperando_tarea' → reenvía como entrega de tarea + analiza.
 *  2. Si el usuario tiene una suscripción pendiente → reenvía como comprobante de pago.
 *  3. Caso general → descarga la imagen, la analiza con el motor de visión y responde.
 *
 * Reemplaza el handler 'message:photo' de messages.ts para separar responsabilidades.
 */

import { Composer } from 'grammy';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';

import { config } from '../../config/index.js';
import { analyzeHomework, analyzeImage } from '../../agent/vision.js';
import { processUserMessage } from '../../agent/loop.js';
import {
  getUserByTelegramId,
  checkUserLimit,
  incrementUsage,
  getUserSubscriptions,
  updateUserStatus,
  db,
} from '../../memory/db.js';
import { sendLongMessage } from '../utils.js';

const streamPipeline = promisify(pipeline);

export const photos = new Composer();

// ── Utilidad: descargar foto de Telegram a disco ─────────────────────────────

async function downloadTelegramPhoto(
  ctx: any,
  fileId: string,
  suffix: string = 'photo'
): Promise<string> {
  const file    = await ctx.api.getFile(fileId);
  const ext     = path.extname(file.file_path ?? '.jpg') || '.jpg';
  const tempDir = path.resolve(process.cwd(), 'temp');

  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const localPath = path.resolve(tempDir, `${suffix}_${Date.now()}${ext}`);
  const fileUrl   = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

  const response = await fetch(fileUrl);
  // @ts-ignore — Node fetch body es compatible con stream.pipeline
  await streamPipeline(response.body, fs.createWriteStream(localPath));

  return localPath;
}

// ── Handler principal de fotos ────────────────────────────────────────────────

photos.on('message:photo', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const user = getUserByTelegramId(userId);
  if (!user) return;

  // La foto de mayor resolución siempre es la última del array
  const photo  = ctx.message.photo.at(-1);
  if (!photo) return;

  const fileId = photo.file_id;

  // ── Caso 1: Alumno en modo entrega de tarea ──────────────────────────────
  if (user.status === 'esperando_tarea') {
    const metadataStr = (user as any).metadata;
    const metadata    = metadataStr
      ? JSON.parse(metadataStr)
      : { nombre: user.name || 'Desconocido', cedula: 'N/A', seccion: 'N/A' };

    const header =
      `📚 <b>NUEVA TAREA ENTREGADA (Imagen)</b>\n` +
      `👤 Alumno: <b>${metadata.nombre}</b>\n` +
      `🆔 CI: <code>${metadata.cedula}</code>\n` +
      `📍 Sección: <b>${metadata.seccion}</b>\n`;

    await ctx.reply('✅ He recibido tu tarea (imagen) y se la he enviado al profesor.', {
      reply_to_message_id: ctx.message?.message_id,
    });

    updateUserStatus(user.id, 'active');

    // Reenviar foto a administradores
    for (const adminId of config.TELEGRAM_ALLOWED_USER_IDS) {
      try {
        await ctx.api.sendMessage(adminId, header, { parse_mode: 'HTML' });
        await ctx.forwardMessage(adminId);
      } catch (e) {
        console.error('[Photos] Error forwarding homework image:', e);
      }
    }

    // Analizar la tarea con visión y enviar retroalimentación al alumno
    const limit = checkUserLimit(userId);
    if (limit.allowed) {
      try {
        await ctx.replyWithChatAction('typing');
        incrementUsage(user.id);

        const localPath = await downloadTelegramPhoto(ctx, fileId, 'homework');

        const result = await analyzeHomework(
          localPath,
          `Materia: ${config.BOT_NAME}. Alumno: ${metadata.nombre} - Sección: ${metadata.seccion}`
        );

        await sendLongMessage(
          ctx,
          `<b>📝 Análisis de tu tarea:</b>\n\n${result.text}`
        );

        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      } catch (visionError: any) {
        console.error('[Photos] Error en análisis de tarea:', visionError.message);
        // No bloquear el flujo si el análisis falla — la tarea ya fue reenviada
      }
    }

    return;
  }

  // ── Caso 2: Comprobante de pago pendiente ────────────────────────────────
  const pendingSub = getUserSubscriptions(user.id).find(s => s.status === 'pending');
  if (pendingSub) {
    const adminMsg =
      `📸 <b>NUEVO COMPROBANTE</b>\n` +
      `👤 Usuario: ${user.name || userId}\n` +
      `🆔 Sub: ${pendingSub.id}`;

    for (const adminId of config.TELEGRAM_ALLOWED_USER_IDS) {
      try {
        await ctx.api.sendPhoto(adminId, fileId, { caption: adminMsg, parse_mode: 'HTML' });
      } catch (e) {
        console.error('[Photos] Error enviando comprobante al admin:', e);
      }
    }

    db.prepare(
      'UPDATE subscriptions SET payment_reference = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run('IMAGEN_ENVIADA', pendingSub.id);

    return await ctx.reply('✅ Comprobante recibido. El administrador lo revisará pronto.');
  }

  // ── Caso 3: Análisis general de imagen ───────────────────────────────────
  const limit = checkUserLimit(userId);
  if (!limit.allowed) return;

  const caption = ctx.message.caption ?? '';

  try {
    await ctx.replyWithChatAction('typing');
    incrementUsage(user.id);

    const localPath = await downloadTelegramPhoto(ctx, fileId, 'image');

    const result = await analyzeImage(
      localPath,
      'general',
      caption || '¿Qué ves en esta imagen? Descríbela y analízala.',
      `Bot: ${config.BOT_NAME}`
    );

    // Pasar el análisis al agente para que lo integre en la conversación
    const agentText  = caption
      ? `El usuario envió una imagen con la leyenda: "${caption}". Análisis visual: ${result.text}`
      : `El usuario envió una imagen. Análisis visual: ${result.text}`;

    const agentReply = await processUserMessage(userId, agentText);
    await sendLongMessage(ctx, agentReply);

    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  } catch (error: any) {
    console.error('[Photos] Error en análisis general:', error.message);
    await ctx.reply(
      '⚠️ No pude analizar la imagen en este momento. Por favor intenta de nuevo o envía una descripción en texto.'
    );
  }
});
