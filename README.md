SynergIA es un ecosistema de agentes personales inteligentes operando sobre Telegram, diseñado para potenciar la productividad mediante análisis de documentos, síntesis de voz y automatización de búsquedas.

**Versión Actual:** `v2.1.0` (Gestionada en `package.json`)

### Novedades v2.1.0
- **Entrega de Tareas:** Nuevo flujo con comando `/entregar_tarea` y reenvío directo al profesor con metadatos del estudiante (Nombre, Cédula, Sección).
- **Manual Fijo:** Añadido el comando `/manual` (`/ayuda`, `/help`) con instrucciones pedagógicas claras para los alumnos.
- **Sincronización de Bibliografía:** Escaneo recursivo de carpetas de Google Drive (incluyendo subcarpetas) para unificada indexación y búsqueda semántica de documentos (RAG).


---

## 📋 Tabla de Contenidos

- [Arquitectura del Proyecto](#-arquitectura-del-proyecto)
- [Pruebas y QA](#-pruebas-y-qa)
- [Gestión del Proyecto (PM2)](#-gestión-del-proyecto-pm2)
- [OpenCode + OpenRouter](#-opencode--openrouter)
  - [Configuración](#1-configuración)
  - [Modelos Gratuitos](#2-modelos-gratuitos-27-disponibles)
  - [Modelos Premium](#3-modelos-premium)
  - [Comandos Útiles](#4-comandos-útiles-de-opencode)

---

## 🏗️ Arquitectura del Proyecto

El bot ha sido refactorizado recientemente (v2.0.0) para seguir una estructura modular basada en `Composer` de **grammY**:

- **`src/bot/handlers/`**: Contiene la lógica dividida por tipo de interacción.
    - `commands.ts`: Manejo de comandos estáticos (`/start`, `/reset`, `/audio`).
    - `messages.ts`: Gestión de mensajes de texto, audios/voz, documentos (PDF/DOCX) y fotos.
    - `callbacks.ts`: Procesamiento de botones inline y flujo de suscripciones.
- **`src/bot/utils.ts`**: Utilidades comunes para formateo HTML y envío de mensajes largos.
- **`src/memory/`**: Lógica de persistencia en SQLite y sincronización con Firebase/Google Drive.
- **`src/agent/`**: Motor de razonamiento (LLM), transcripción y síntesis de voz.

---

## 🧪 Pruebas y QA

El proyecto cuenta con una suite de pruebas automatizadas con **Vitest**:

```bash
npm test          # Ejecutar todos los tests
npm run test:watch # Modo desarrollo (recarga al guardar)
```

**Principales suites:**
- `db.test.ts`: Control de cuotas y límites mensuales.
- `subscriptions.test.ts`: Flujo de pagos y verificación de planes.
- `bot_logic.test.ts`: Integración de la lógica del agente.

---

## 🚀 Gestión del Proyecto (PM2)

Comandos para administrar las instancias del bot:

| Acción | SynergIA | Tutor CsAdmin PhD |
|--------|----------|--------------------|
| **Ver logs** | `npx pm2 logs synergia` | `npx pm2 logs synergia-tutor` |
| **Reiniciar** | `npx pm2 restart synergia` | `npx pm2 restart synergia-tutor` |
| **Detener** | `npx pm2 stop synergia` | `npx pm2 stop synergia-tutor` |

**Comandos globales:**

```bash
npx pm2 status                        # Estado general de todas las instancias
npx pm2 restart ecosystem.config.cjs  # Levantar todo
npx pm2 stop all                      # Detener todo
```

---

## 💻 OpenCode + OpenRouter

Guía para acceder a modelos de IA gratuitos y premium desde el terminal, útil cuando se agotan los tokens de Antigravity.

### 1. Configuración

```bash
# Configurar la API Key de OpenRouter (necesario una sola vez por sesión de terminal)
export OPENROUTER_API_KEY=tu_clave_aqui

# Verificar proveedores configurados
opencode providers list
```

### 2. Modelos Gratuitos (27 disponibles)

> **Última actualización:** 26 de marzo de 2026  
> Estos modelos no requieren saldo en OpenRouter.

#### ⭐ Router Automático

Deja que OpenRouter elija el mejor modelo gratuito disponible:

```bash
opencode -m openrouter/free    # 200k contexto
```

#### 🏆 Recomendados (Mayor capacidad)

| Modelo | Contexto | Comando |
|--------|----------|---------|
| **Qwen3 Coder 480B** ← _CODING_ | 262k | `opencode -m qwen/qwen3-coder:free` |
| **Hermes 3 (405B)** | 131k | `opencode -m nousresearch/hermes-3-llama-3.1-405b:free` |
| **Nemotron 3 Super (120B)** | 262k | `opencode -m nvidia/nemotron-3-super-120b-a12b:free` |
| **GPT-OSS 120B** | 131k | `opencode -m openai/gpt-oss-120b:free` |
| **Llama 3.3 70B** | 65k | `opencode -m meta-llama/llama-3.3-70b-instruct:free` |
| **MiniMax M2.5** | 196k | `opencode -m minimax/minimax-m2.5:free` |

#### Google

| Modelo | Contexto | Comando |
|--------|----------|---------|
| Gemma 3 27B | 131k | `opencode -m google/gemma-3-27b-it:free` |
| Gemma 3 12B | 32k | `opencode -m google/gemma-3-12b-it:free` |
| Gemma 3 4B | 32k | `opencode -m google/gemma-3-4b-it:free` |
| Gemma 3n 4B | 8k | `opencode -m google/gemma-3n-e4b-it:free` |
| Gemma 3n 2B | 8k | `opencode -m google/gemma-3n-e2b-it:free` |

#### Qwen

| Modelo | Contexto | Comando |
|--------|----------|---------|
| Qwen3 Next 80B | 262k | `opencode -m qwen/qwen3-next-80b-a3b-instruct:free` |
| Qwen3 4B | 40k | `opencode -m qwen/qwen3-4b:free` |

#### NVIDIA

| Modelo | Contexto | Comando |
|--------|----------|---------|
| Nemotron 3 Nano 30B | 256k | `opencode -m nvidia/nemotron-3-nano-30b-a3b:free` |
| Nemotron Nano 12B VL ← _VISION_ | 128k | `opencode -m nvidia/nemotron-nano-12b-v2-vl:free` |
| Nemotron Nano 9B | 128k | `opencode -m nvidia/nemotron-nano-9b-v2:free` |

#### Otros

| Modelo | Contexto | Comando |
|--------|----------|---------|
| Mistral Small 3.1 24B | 128k | `opencode -m mistralai/mistral-small-3.1-24b-instruct:free` |
| GPT-OSS 20B | 131k | `opencode -m openai/gpt-oss-20b:free` |
| StepFun 3.5 Flash | 256k | `opencode -m stepfun/step-3.5-flash:free` |
| Arcee Trinity Large | 131k | `opencode -m arcee-ai/trinity-large-preview:free` |
| Arcee Trinity Mini | 131k | `opencode -m arcee-ai/trinity-mini:free` |
| LiquidAI 1.2B Instruct | 32k | `opencode -m liquid/lfm-2.5-1.2b-instruct:free` |
| LiquidAI 1.2B Thinking | 32k | `opencode -m liquid/lfm-2.5-1.2b-thinking:free` |
| GLM 4.5 Air | 131k | `opencode -m z-ai/glm-4.5-air:free` |
| Meta Llama 3.2 3B | 131k | `opencode -m meta-llama/llama-3.2-3b-instruct:free` |
| Dolphin Mistral 24B ← _SIN CENSURA_ | 32k | `opencode -m cognitivecomputations/dolphin-mistral-24b-venice-edition:free` |

### 3. Modelos Premium

Requieren saldo en tu cuenta de OpenRouter:

| Modelo | Comando |
|--------|---------|
| **Claude 3.7 Sonnet** | `opencode -m openrouter/anthropic/claude-3.7-sonnet` |
| **DeepSeek R1** | `opencode -m openrouter/deepseek/deepseek-r1` |

### 4. Comandos Útiles de OpenCode

```bash
# Iniciar sesión interactiva (TUI)
opencode

# Consulta rápida sin entrar al modo interactivo
opencode --prompt "Tu pregunta aquí"

# Continuar la última sesión
opencode --continue

# Continuar una sesión específica
opencode --session <session_id>

# Ver estadísticas de uso de tokens
opencode stats

---

*Documento actualizado el 23 de abril de 2026 (v2.1.0).*