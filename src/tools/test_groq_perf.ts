import { Groq } from 'groq-sdk';
import { config } from '../config/index.js';

const groq = new Groq({ 
    apiKey: config.GROQ_API_KEY 
});

async function testPerformance() {
    console.log('--- Probando rendimiento de Groq ---');
    console.log(`Fecha/Hora: ${new Date().toLocaleString()}`);
    console.log('Enviando petición a llama-3.3-70b-versatile...');

    const start = Date.now();
    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: 'Hola, responde solo con la palabra OK.' }],
        });
        const end = Date.now();
        const duration = (end - start) / 1000;

        console.log(`Respuesta recibida: "${response.choices[0].message.content}"`);
        console.log(`Tiempo de respuesta: ${duration.toFixed(2)} segundos`);
        
        if (duration > 5) {
            console.warn('⚠️ La respuesta tardó más de 5 segundos. Esto es inusualmente lento para Groq.');
        } else {
            console.log('✅ Velocidad normal para Groq.');
        }
    } catch (error: any) {
        console.error('❌ Error en la petición:', error.message);
        if (error.status === 403) {
            console.error('Bloqueo regional detectado (403).');
        }
    }
}

testPerformance();
