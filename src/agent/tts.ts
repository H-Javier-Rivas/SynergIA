import { config } from '../config/index.js';
import fs from 'fs';
import path from 'path';
import * as googleTTS from 'google-tts-api';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

/**
 * Genera un archivo de audio a partir de texto.
 * Intenta usar ElevenLabs primero, y si falla, usa Google TTS como respaldo.
 */
export async function generateSpeech(text: string): Promise<string | null> {
    const tempDir = path.resolve(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    const filePath = path.resolve(tempDir, `speech_${Date.now()}.mp3`);

    // --- INTENTO 1: ElevenLabs (Calidad Premium) ---
    if (config.ELEVENLABS_API_KEY && config.ELEVENLABS_API_KEY !== "TU_KEY_AQUI") {
        try {
            console.log('🎙️ Intentando generar voz con ElevenLabs...');
            let voiceId = '21m00T8oc7B6oMv6Utmz'; // Rachel (Default)

            const response = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
                method: 'POST',
                headers: {
                    'accept': 'audio/mpeg',
                    'xi-api-key': config.ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text,
                    model_id: 'eleven_multilingual_v2',
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
                }),
            });

            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
                return filePath;
            }

            const errorData = await response.json().catch(() => ({}));
            console.warn('⚠️ ElevenLabs falló o está bloqueado:', errorData?.detail?.status || response.statusText);
            
            // Si es un error de actividad inusual o cuota, pasamos directamente al fallback
            if (JSON.stringify(errorData).includes('unusual_activity') || response.status === 403 || response.status === 429) {
                console.warn('🔄 Saltando a voz de respaldo (Google TTS)...');
            } else {
                // Otros errores (como voz no encontrada) podrían intentarse con otra voz, pero para simplificar, fallback.
            }
        } catch (error) {
            console.error('❌ Error crítico en ElevenLabs:', error);
        }
    }

    // --- INTENTO 2: Google TTS (Respaldo Infalible y Gratuito) ---
    try {
        console.log('🎙️ Generando voz con Google TTS (Respaldo)...');
        
        // Google TTS tiene un límite de 200 caracteres por petición, así que truncamos o dividimos.
        // Por simplicidad para el bot, tomaremos los primeros 200 caracteres si es muy largo,
        // o podrías implementar un bucle si prefieres el texto completo.
        const safeText = text.substring(0, 200); 
        
        const url = googleTTS.getAudioUrl(safeText, {
            lang: 'es',
            slow: false,
            host: 'https://translate.google.com',
        });

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Google TTS falló: ${response.statusText}`);

        const arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
        
        console.log('✅ Voz de respaldo generada con éxito.');
        return filePath;
    } catch (error: any) {
        console.error('❌ Error fatal en todos los sistemas de voz:', error.message);
        return null;
    }
}
