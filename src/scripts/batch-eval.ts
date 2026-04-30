/**
 * @script batch-eval.ts
 * @description Procesa masivamente archivos (PDF e imágenes) de una carpeta local
 * y genera una evaluación pedagógica de estadística para cada uno.
 */

import fs from 'fs';
import path from 'path';
import { analyzePDFWithVision } from '../agent/pdf-vision.js';
import { analyzeImage } from '../agent/vision.js';
import { extractPagesFromPdf } from '../agent/document.js';
import { classifyTaskContent } from '../bot/task-organizer.js';
import { RUBRICA_TAREA_1, RUBRICA_TAREA_2 } from '../data/rubricas.js';

// Cargar lista oficial de alumnos para matching
const alumnosData = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/data/alumnos.json'), 'utf8'));
const LISTA_ALUMNOS = alumnosData.alumnos;



// Configurar el entorno para la instancia de estadística
process.env.INSTANCE_ID = 'estadistica';

async function runBatchEval() {
  // --- CONFIGURACIÓN ---
  // El usuario puede cambiar esta ruta a la carpeta donde tenga las tareas
  const inputDir = process.argv[2] || path.resolve(process.cwd(), 'tareas_pendientes');
  const reportPath = path.join(inputDir, `reporte_evaluacion_${Date.now()}.md`);

  if (!fs.existsSync(inputDir)) {
    console.error(`❌ La carpeta no existe: ${inputDir}`);
    console.log(`Uso: npx tsx src/scripts/batch-eval.ts "C:\\Ruta\\A\\Mis\\Tareas"`);
    return;
  }

  const files = fs.readdirSync(inputDir).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.pdf', '.jpg', '.jpeg', '.png', '.webp'].includes(ext);
  });

  if (files.length === 0) {
    console.log('⚠️ No se encontraron archivos PDF o imágenes en la carpeta.');
    return;
  }

  console.log(`🚀 Iniciando evaluación masiva de ${files.length} archivos...`);
  console.log(`📝 Reporte: ${reportPath}\n`);

  fs.writeFileSync(reportPath, `# REPORTE DE EVALUACIÓN AUTOMÁTICA - SYNERGIA\n\nFecha: ${new Date().toLocaleString()}\nCarpeta: ${inputDir}\n\n---\n\n`);

  for (const [index, file] of files.entries()) {
    const filePath = path.join(inputDir, file);
    const ext = path.extname(file).toLowerCase();
    
    console.log(`[${index + 1}/${files.length}] Procesando: ${file}...`);
    
    try {
      let evaluation = '';
      let studentIdentity = "No identificado";
      let taskCategory = 'Otras';
      let rubricToUse = '';

      // --- PASO 1: Identificación y Clasificación Contextual (Página 1) ---
      console.log(`  -> Identificando alumno y tarea...`);
      
      const idPrompt = `Analiza la primera página de esta tarea de estadística.
1. Identifica el NOMBRE completo del alumno y su CÉDULA/ID.
2. Identifica de qué trata la tarea buscando palabras clave:
   - Si habla de "Historia", "Prehistoria", "Línea del tiempo", "Hitos", "Método Estadístico", "Contaduría" o "Mapa Mental" -> Es TAREA 1.
   - Si habla de "Datos Agrupados", "Rango", "Ancho de clase", "Johnson & Kuby", "Intervalos", "Pérdida de identidad" -> Es TAREA 2.
   
Responde en este formato exacto:
ALUMNO: [Nombre o "No identificado"]
ID: [Cédula o "No identificado"]
CATEGORIA: [Tarea 1, Tarea 2 o Otras]`;

      if (ext === '.pdf') {
        const firstPageResult = await analyzePDFWithVision(filePath, { pages: [1], userPrompt: idPrompt });
        const idText = firstPageResult.combinedText;
        
        // Parsear identificación
        const nameMatch = idText.match(/ALUMNO:\s*(.*)/i);
        const idMatch = idText.match(/ID:\s*(.*)/i);
        const catMatch = idText.match(/CATEGORIA:\s*(Tarea 1|Tarea 2|Otras)/i);
        
        studentIdentity = nameMatch ? nameMatch[1].trim() : "No identificado";
        const studentIDFound = idMatch ? idMatch[1].trim() : "No identificado";
        taskCategory = catMatch ? catMatch[1].trim() : 'Otras';

        // Intentar match con lista oficial para limpiar el nombre
        const officialStudent = LISTA_ALUMNOS.find((a: any) => 
          studentIdentity.toLowerCase().includes(a.nombre.split(',')[0].toLowerCase().trim()) || 
          (studentIDFound !== 'No identificado' && a.cedula.includes(studentIDFound.replace(/\D/g,'')))
        );
        
        if (officialStudent) {
          studentIdentity = officialStudent.nombre;
          console.log(`     [Match Oficial]: ${studentIdentity}`);
        }

        rubricToUse = taskCategory === 'Tarea 1' ? RUBRICA_TAREA_1 : (taskCategory === 'Tarea 2' ? RUBRICA_TAREA_2 : '');
        
        console.log(`     [ID]: ${studentIdentity} | [Tarea]: ${taskCategory}`);

        // --- PASO 2: Evaluación con Contexto ---
        const evalPrompt = `Actúa como un profesor evaluando la tarea de ${studentIdentity}. 
        ${rubricToUse ? `Usa esta rúbrica:\n${rubricToUse}` : 'Evalúa el contenido estadístico detalladamente.'}
        
        IMPORTANTE: Ya sabemos que el alumno es ${studentIdentity}. No repitas la búsqueda de nombre en esta página. Solo evalúa el contenido de esta hoja específica.`;

        const finalResult = await analyzePDFWithVision(filePath, { visionTask: 'homework', userPrompt: evalPrompt });
        evaluation = finalResult.combinedText;

      } else {
        // Para imágenes sueltas (1 sola página)
        const result = await analyzeImage(filePath, 'homework', idPrompt + "\n\n" + (taskCategory === 'Tarea 1' ? RUBRICA_TAREA_1 : RUBRICA_TAREA_2));
        evaluation = result.text;
      }

      const reportEntry = `## 👤 ALUMNO: ${studentIdentity}\n**Archivo:** ${file}\n**Clasificación:** ${taskCategory}\n\n${evaluation}\n\n---\n\n`;

      fs.appendFileSync(reportPath, reportEntry);
      
      console.log(`✅ ${file} completado.`);
    } catch (err: any) {
      console.error(`❌ Error procesando ${file}: ${err.message}`);
      fs.appendFileSync(reportPath, `## 📄 Archivo: ${file}\n\n⚠️ **ERROR EN EVALUACIÓN:** ${err.message}\n\n---\n\n`);
    }
  }

  console.log(`\n✨ ¡Proceso finalizado!`);
  console.log(`📂 El reporte detallado se encuentra en: ${reportPath}`);
}

runBatchEval().catch(err => {
  console.error('Fallo crítico en el script:', err);
});
