import { Groq } from 'groq-sdk';
import { config } from '../config/index.js';
import fs from 'fs';
import path from 'path';
import { File } from 'buffer';
import { GoogleGenerativeAI } from "@google/generative-ai";

const groq = new Groq({ 
    apiKey: config.GROQ_API_KEY,
    defaultHeaders: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
});

const genAI = config.GEMINI_API_KEY ? new GoogleGenerativeAI(config.GEMINI_API_KEY) : null;

export async function transcribeAudio(filePath: string): Promise<string> {
    try {
        const fileContent = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);
        const ext = path.extname(filePath).toLowerCase();
        
        // Mapeo refinado de MIME types para Groq
        let mimeType = 'audio/mpeg';
        if (ext === '.ogg' || ext === '.oga') mimeType = 'audio/ogg';
        if (ext === '.wav') mimeType = 'audio/wav';
        if (ext === '.flac') mimeType = 'audio/flac';

        // @ts-ignore
        const audioFile = new File([fileContent], fileName, { type: mimeType });

        const transcription = await groq.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-large-v3",
            response_format: "json",
            language: "es",
        });

        return transcription.text;
    } catch (error: any) {
        // Bloqueo 403 (Groq/Cloudflare)
        if (error?.status === 403 || error?.message?.includes('403')) {
            console.warn('Groq detectó un error 403. Activando fallback multimodelo de Gemini...');
            
            if (genAI) {
                // Lista de modelos de Gemini a probar en orden de preferencia/disponibilidad
                const geminiModels = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-pro-latest"];
                let lastGeminiError = "";

                for (const modelName of geminiModels) {
                    try {
                        console.log(`Intentando trascripción con Gemini: ${modelName}...`);
                        const model = genAI.getGenerativeModel({ model: modelName });
                        const fileContent = fs.readFileSync(filePath);
                        const base64Audio = fileContent.toString('base64');
                        
                        const ext = path.extname(filePath).toLowerCase();
                        let geminiMimeType = 'audio/mpeg';
                        if (ext === '.ogg' || ext === '.oga') geminiMimeType = 'audio/ogg';
                        if (ext === '.wav') geminiMimeType = 'audio/wav';

                        const result = await model.generateContent([
                            {
                                inlineData: {
                                    data: base64Audio,
                                    mimeType: geminiMimeType
                                }
                            },
                            "Transcribe este audio en español. Solo devuelve el texto transcrito."
                        ]);
                        
                        const text = result.response.text();
                        if (text && text.trim().length > 0) return text;
                    } catch (geminiError: any) {
                        lastGeminiError = geminiError.message || geminiError;
                        console.error(`Gemini (${modelName}) falló:`, lastGeminiError);
                        // Si es un error de saturación (503) o cuota (429), intentamos el siguiente modelo
                        if (lastGeminiError.includes("503") || lastGeminiError.includes("429")) {
                            continue;
                        }
                        break; // Para otros errores (como problemas de API Key), paramos
                    }
                }
                throw new Error(`Groq bloqueado (403) y todos los modelos de Gemini fallaron: ${lastGeminiError}`);
            } else {
                throw new Error('Groq bloqueado (403) y no hay GEMINI_API_KEY configurada para el respaldo.');
            }
        }
        
        console.error('Error en la transcripción de Groq:', error?.message || error);
        throw new Error(`Fallo en el servidor de audio: ${error?.message || 'Error desconocido'}`);
    }
}
