/**
 * @file pdf-vision-example.ts
 * @description Ejemplo de uso del módulo pdf-vision para extraer imágenes de PDFs y analizarlos con visión.
 * 
 * Uso: npx tsx src/examples/pdf-vision-example.ts <path-to-pdf-file>
 */

import path from 'path';
import { analyzePDFWithVision, extractTextFromPDF } from '../agent/pdf-vision.js';

async function main() {
  // Obtener la ruta del PDF desde los argumentos de la línea de comandos
  const pdfPath = process.argv[2];
  
  if (!pdfPath) {
    console.error('Por favor, proporciona la ruta a un archivo PDF como argumento.');
    console.error('Uso: npx tsx src/examples/pdf-vision-example.ts <path-to-pdf-file>');
    process.exit(1);
  }
  
  try {
    console.log(`Analizando PDF: ${pdfPath}`);
    
    // Método 1: Análisis general con visión artificial
    console.log('\n=== MÉTODO 1: Análisis general con visión artificial ===');
    const result = await analyzePDFWithVision(pdfPath, {
      pages: [1], // Solo analizar la primera página para el ejemplo
      visionTask: 'general',
      userPrompt: 'Describe detalladamente el contenido de esta página',
      context: 'Este es un PDF con imágenes escaneadas de un cuaderno'
    });
    
    console.log(`\nResultado del análisis:`);
    console.log(`- Páginas procesadas: ${result.pagesProcessed}`);
    console.log(`- Modelos utilizados: ${result.modelsUsed.join(', ')}`);
    console.log('\nContenido combinado:');
    console.log('----------------------------------------');
    console.log(result.combinedText.substring(0, 500) + '...');
    console.log('----------------------------------------');
    
    // Método 2: Extracción de texto específica para documentos
    console.log('\n=== MÉTODO 2: Extracción de texto específica para documentos ===');
    const extractionResult = await extractTextFromPDF(pdfPath, {
      pages: [1], // Solo analizar la primera página para el ejemplo
    });
    
    console.log(`\nResultado de la extracción:`);
    console.log(`- Páginas procesadas: ${extractionResult.pagesProcessed}`);
    console.log(`- Modelos utilizados: ${extractionResult.modelsUsed.join(', ')}`);
    console.log('\nTexto extraído:');
    console.log('----------------------------------------');
    console.log(extractionResult.combinedText.substring(0, 500) + '...');
    console.log('----------------------------------------');
    
  } catch (error) {
    console.error('Error al procesar el PDF:', error);
    process.exit(1);
  }
}

main().catch(console.error);