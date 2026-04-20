# Guía para Crear Nuevos Agentes en SynergIA 🤖

SynergIA está diseñado como un sistema **multi-agente** donde una misma base de código puede alimentar múltiples bots de Telegram con personalidades, conocimientos y capacidades distintas.

Cada agente se define mediante un `INSTANCE_ID`. Para crear uno nuevo (ej. `estadistica`), sigue estos pasos:

---

## 1. Configurar la Identidad (Perfil JSON)

Crea un archivo en `src/config/profiles/nombre_agente.json`. Este archivo define:
- **Nombre**: Cómo se presenta el bot.
- **System Prompt**: Su "personalidad" e instrucciones críticas de comportamiento.
- **Capabilities**: Qué comandos y comandos de IA tiene habilitados (buscar_paper, resumir, etc.).
- **Knowledge**: Ruta a archivos de texto con conocimiento específico.
- **Métodos de Pago**: Datos de transferencia para las suscripciones.

## 2. Configurar las Credenciales (.env)

Crea un archivo `.env.nombre_agente`. SynergIA buscará automáticamente este archivo si el `INSTANCE_ID` coincide. Debe contener:
- `TELEGRAM_BOT_TOKEN`: El token obtenido de @BotFather.
- `TELEGRAM_ALLOWED_USER_IDS`: IDs de Telegram autorizados para administrar el bot.

## 3. Registro en el Ecosistema (PM2)

Edita `ecosystem.config.cjs` para añadir la nueva instancia:

```javascript
{
  name: "synergia-estadistica",
  script: "node_modules/tsx/dist/cli.mjs",
  args: "src/index.ts",
  env: {
    INSTANCE_ID: "estadistica"
  }
}
```

## 4. Gestión de Datos

El sistema creará automáticamente una base de datos separada llamada `memory_nombre_agente.db` para mantener los usuarios y consumos de este bot de forma aislada.
