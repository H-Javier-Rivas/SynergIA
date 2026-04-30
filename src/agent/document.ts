import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import mammoth from 'mammoth';
import { chatCompletion } from './llm.js';

export interface DocMetadata {
    author?: string;
    year?: string;
    title?: string;
    publisher?: string;
}

export async function extractPagesFromPdf(filePath: string): Promise<string[]> {
    const pages: string[] = [];
    try {
        const dataBuffer = fs.readFileSync(filePath);
        
        // Custom pagerender to capture each page separately
        const options = {
            pagerender: (pageData: any) => {
                return pageData.getTextContent().then((textContent: any) => {
                    let lastY, text = '';
                    for (let item of textContent.items) {
                        if (lastY == item.transform[5] || !lastY){
                            text += item.str;
                        } else {
                            text += '\n' + item.str;
                        }    
                        lastY = item.transform[5];
                    }
                    pages.push(text);
                    return text;
                });
            }
        };

        await pdfParse(dataBuffer, options);
        return pages;
    } catch (error) {
        console.error('Error extracting pages from PDF:', error);
        return [];
    }
}

export async function extractTextFromPdf(filePath: string): Promise<string> {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        throw new Error('No se pudo extraer el texto del PDF.');
    }
}

export async function extractTextFromDocx(filePath: string): Promise<string> {
    try {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
    } catch (error) {
        console.error('Error extracting text from DOCX:', error);
        throw new Error('No se pudo extraer el texto del documento Word.');
    }
}

export async function extractMetadata(text: string): Promise<DocMetadata> {
    try {
        // Usar solo los primeros 3000 caracteres para extraer metadatos (portada)
        const sample = text.substring(0, 3000);
        const prompt = `Analiza el siguiente texto de la portada o inicio de un libro/documento académico y extrae los metadatos para una cita APA.
Responde ÚNICAMENTE en formato JSON plano con esta estructura:
{
  "author": "Nombre del autor o autores",
  "year": "Año de publicación",
  "title": "Título completo del libro",
  "publisher": "Editorial o institución"
}

Si no encuentras un dato, pon "Desconocido".

Texto:
${sample}`;

        const response = await chatCompletion([
            { role: 'system', content: 'Eres un experto bibliotecario y especialista en normas APA.' },
            { role: 'user', content: prompt }
        ]);

        if (response && response.content) {
            // Limpiar posible formato markdown si el LLM lo incluye
            const jsonStr = (response.content.match(/\{.*\}/s) || [','])[0];
            try {
                return JSON.parse(jsonStr);
            } catch (e) {
                console.error('Error parsing JSON from LLM metadata response:', e);
                return {};
            }
        }
        return {};
    } catch (error) {
        console.error('Error extracting metadata with AI:', error);
        return {};
    }
}
