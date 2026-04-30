/**
 * @file tests/vision.test.ts
 * @description Tests unitarios e integración para el módulo de visión de SynergIA.
 *
 * Estrategia de testing:
 *  - Tests sin red (unit): validan lógica interna con vi.stubGlobal('fetch').
 *  - Tests de registro: validan que la tool está correctamente integrada al toolsRegistry.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Helper: imagen PNG 1x1 mínima válida ─────────────────────────────────────

function createTestImageFile(): string {
  const minimalPng = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108020000' +
    '0090d7a4540000000c4944415408d76360f8cfc00000000200016e21' +
    'bc330000000049454e44ae426082',
    'hex'
  );
  const tmpPath = path.join(os.tmpdir(), `synergia_vision_test_${Date.now()}.png`);
  fs.writeFileSync(tmpPath, minimalPng);
  return tmpPath;
}

// ── Suite 1: Lógica de analyzeImage con fetch mockeado (unit) ────────────────

describe('Motor de Visión — analyzeImage (fetch mockeado)', () => {
  let testImagePath: string;

  beforeAll(() => {
    testImagePath = createTestImageFile();
    process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'test-key-mock';
  });

  afterAll(() => {
    if (fs.existsSync(testImagePath)) fs.unlinkSync(testImagePath);
  });

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('lanza error si el archivo de imagen no existe', async () => {
    const { analyzeImage } = await import('../src/agent/vision.js');
    await expect(
      analyzeImage('/ruta/que/no/existe.png', 'general', 'test', '')
    ).rejects.toThrow('Archivo de imagen no encontrado');
  });

  it('retorna VisionResult correcto con fetch exitoso (primer modelo gratuito)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('generativelanguage.googleapis.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Análisis mock exitoso.' }] } }],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Análisis mock exitoso.' } }],
        }),
      };
    }));

    const { analyzeImage } = await import('../src/agent/vision.js');
    const result = await analyzeImage(testImagePath, 'general', 'Describe la imagen', '');

    expect(result.text).toBe('Análisis mock exitoso.');
    expect(result.wasPaidFallback).toBe(false);
    expect(result.modelUsed).toMatch(/direct|:free/);
  });

  it('hace fallback a modelo de pago cuando todos los gratuitos dan 429', async () => {
    const FALLBACK_THRESHOLD = 2; // Solo fallan los 2 primeros modelos (Gemini Direct y OpenRouter Primary)
    let callCount = 0;

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (url.includes('generativelanguage.googleapis.com')) {
        return { ok: false, status: 429, json: async () => ({ error: { code: 429, message: 'Rate limit exceeded' } }) };
      }
      // Primeros intentos fallan (simulado)
      if (callCount <= FALLBACK_THRESHOLD) {
        return { ok: false, status: 429, json: async () => ({ error: { code: 429, message: 'Rate limit exceeded' } }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Análisis con modelo de pago.' } }],
        }),
      };
    }));

    const { analyzeImage } = await import('../src/agent/vision.js');
    const result = await analyzeImage(testImagePath, 'homework', 'test', '');

    expect(result.wasPaidFallback).toBe(true);
    expect(result.text).toBe('Análisis con modelo de pago.');
  });

  it('lanza error cuando TODOS los modelos (free + paid) fallan con 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ error: { code: 429, message: 'Rate limit exceeded' } }),
    }));

    const { analyzeImage } = await import('../src/agent/vision.js');
    await expect(
      analyzeImage(testImagePath, 'general', 'test', '')
    ).rejects.toThrow('No se pudo analizar la imagen');
  });

  it('analyzeHomework retorna análisis con fetch exitoso', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('generativelanguage.googleapis.com')) {
        return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Corrección pedagógica.' }] } }] }) };
      }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Corrección pedagógica.' } }] }) };
    }));

    const { analyzeHomework } = await import('../src/agent/vision.js');
    const result = await analyzeHomework(testImagePath, 'Estadística descriptiva');

    expect(result.text).toBe('Corrección pedagógica.');
    expect(result.wasPaidFallback).toBe(false);
  });

  it('extractTextFromImage retorna texto extraído con fetch exitoso', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({
        choices: [{ message: { content: 'Texto extraído del documento académico.' } }],
      }),
    }));

    const { extractTextFromImage } = await import('../src/agent/vision.js');
    const result = await extractTextFromImage(testImagePath, 'Capítulo 3');

    expect(result.text).toBe('Texto extraído del documento académico.');
  });
});

// ── Suite 2: Tool analyze_image en el registry ───────────────────────────────

describe('Tool de Visión — analyze_image en toolsRegistry', () => {
  let testImagePath: string;

  beforeAll(async () => {
    testImagePath = createTestImageFile();
    // Importar para asegurar que la tool quede registrada
    await import('../src/tools/vision.js');
  });

  afterAll(() => {
    if (fs.existsSync(testImagePath)) fs.unlinkSync(testImagePath);
    vi.unstubAllGlobals();
  });

  it('analyze_image está registrada en el toolsRegistry', async () => {
    const { getTool } = await import('../src/tools/index.js');
    const tool = getTool('analyze_image');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('analyze_image');
  });

  it('tiene descripción y parámetros con la forma correcta', async () => {
    const { getTool } = await import('../src/tools/index.js');
    const tool = getTool('analyze_image');

    expect(tool?.description).toBeTruthy();
    expect(tool?.parameters.properties).toHaveProperty('image_path');
    expect(tool?.parameters.properties).toHaveProperty('task');
    expect(tool?.parameters.properties).toHaveProperty('user_prompt');
    expect(tool?.parameters.properties).toHaveProperty('context');
    expect(tool?.parameters.required).toContain('image_path');
  });

  it('task acepta solo los 3 valores del enum', async () => {
    const { getTool } = await import('../src/tools/index.js');
    const taskEnum = getTool('analyze_image')?.parameters.properties.task.enum;
    expect(taskEnum).toEqual(expect.arrayContaining(['homework', 'document', 'general']));
    expect(taskEnum).toHaveLength(3);
  });

  it('execute añade footer de "modelo premium" cuando wasPaidFallback=true', async () => {
    const FALLBACK_THRESHOLD = 2;
    let n = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      n++;
      if (url.includes('generativelanguage.googleapis.com')) {
        return { ok: false, status: 429, json: async () => ({ error: { code: 429, message: 'rate limit' } }) };
      }
      if (n <= FALLBACK_THRESHOLD) return { ok: false, status: 429, json: async () => ({ error: { code: 429, message: 'rate limit' } }) };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Respuesta premium.' } }] }) };
    }));

    const { getTool } = await import('../src/tools/index.js');
    const tool = getTool('analyze_image');
    const result = await tool!.execute({ image_path: testImagePath, task: 'general' });

    expect(result).toContain('Respuesta premium.');
    expect(result).toContain('modelo premium');

    vi.unstubAllGlobals();
  });

  it('execute NO añade footer con modelo gratuito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('generativelanguage.googleapis.com')) {
        return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Respuesta gratuita.' }] } }] }) };
      }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Respuesta gratuita.' } }] }) };
    }));

    const { getTool } = await import('../src/tools/index.js');
    const tool = getTool('analyze_image');
    const result = await tool!.execute({ image_path: testImagePath, task: 'general' });

    expect(result).toBe('Respuesta gratuita.');
    expect(result).not.toContain('modelo premium');

    vi.unstubAllGlobals();
  });
});
