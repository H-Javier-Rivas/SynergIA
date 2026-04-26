/**
 * @module tools/vision
 * @description Herramienta de visión registrada en el sistema de tools de SynergIA.
 * Permite que el agente LLM analice imágenes cuando reciba una ruta de archivo local.
 * Compatible con todos los bots del ecosistema.
 */

import { registerTool } from './index.js';
import { analyzeImage, type VisionTask } from '../agent/vision.js';

registerTool({
  name: 'analyze_image',
  description:
    'Analiza el contenido de una imagen local. Úsala cuando el usuario haya enviado una foto ' +
    'y quieras obtener su contenido, corregir un trabajo académico, extraer texto de un documento ' +
    'o interpretar un gráfico estadístico. Devuelve un análisis detallado en texto.',
  parameters: {
    type: 'object',
    properties: {
      image_path: {
        type: 'string',
        description: 'Ruta absoluta o relativa al archivo de imagen local a analizar.',
      },
      task: {
        type: 'string',
        enum: ['homework', 'document', 'general'],
        description:
          '"homework" para corregir tareas de alumnos, ' +
          '"document" para extraer texto de bibliografía, ' +
          '"general" para análisis de propósito general.',
      },
      user_prompt: {
        type: 'string',
        description: 'Pregunta o instrucción adicional del usuario sobre la imagen.',
      },
      context: {
        type: 'string',
        description: 'Contexto adicional como nombre de la materia o tema de la asignación.',
      },
    },
    required: ['image_path'],
  },
  execute: async (args: {
    image_path: string;
    task?: VisionTask;
    user_prompt?: string;
    context?: string;
  }) => {
    const result = await analyzeImage(
      args.image_path,
      args.task ?? 'general',
      args.user_prompt ?? 'Analiza esta imagen.',
      args.context ?? ''
    );

    const footer = result.wasPaidFallback
      ? '\n\n<i>⚡ Análisis procesado con modelo premium.</i>'
      : '';

    return result.text + footer;
  },
});
