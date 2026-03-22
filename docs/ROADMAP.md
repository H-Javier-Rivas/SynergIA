# 🧠 SynergIA — Hoja de Ruta del Proyecto

> Documento de seguimiento de avances y próximas fases de desarrollo.
> Actualizado: 2026-03-19

---

## ✅ Fase 1 — Bot funcional en local (COMPLETADA)

- [x] Bot de Telegram conectado y funcionando localmente.
- [x] Sistema de whitelist de usuarios (seguridad básica).
- [x] Memoria de conversación por usuario mediante SQLite.
- [x] Sincronización de historial con Firebase Firestore (nube).
- [x] Integración con LLM: Groq (principal) → OpenRouter → Gemini (fallbacks).
- [x] Herramientas del agente: hora actual, búsqueda en Google.
- [x] Procesamiento de documentos: PDF y Word (.docx).
- [x] Respuestas de voz: ElevenLabs (principal) → Google TTS (respaldo).
- [x] Transcripción de mensajes de voz entrantes (Whisper vía Groq).
- [x] Comandos del bot en español:
  - `/start` — Saludo inicial.
  - `/reset` — Borrar historial de conversación.
  - `/audio [voz|texto|off]` — Gestionar modo de respuesta de audio.
  - `/ayuda` o `/help` — Ver lista de comandos.
- [x] Repositorio Git inicializado con `.gitignore` correcto.

---

## 🔄 Fase 2 — Estabilidad y despliegue en la nube (PRÓXIMA)

### Objetivo principal
Que SynergIA funcione **24/7 aunque la PC esté apagada**, desplegada en la nube con Railway.

### Tareas pendientes

- [ ] **Migrar la memoria de SQLite a Firebase Firestore completamente.**
  - La base de datos local (`memory.db`) se perdería en cada redespliegue en la nube.
  - Todo el historial debe vivir únicamente en Firestore.

- [ ] **Subir el proyecto a GitHub** (repositorio privado).
  - Asegurarse de que el `.gitignore` excluya el `.env` y credenciales.

- [ ] **Desplegar en Railway.**
  - Conectar Railway con el repositorio de GitHub.
  - Configurar las variables de entorno del `.env` en el dashboard de Railway.
  - Verificar que el bot inicia correctamente en producción.

- [x] **Renovar el token OAuth de Gmail** (`gog.exe`).
  - El token anterior había expirado.
  - Se realizó la re-autorización mediante el flujo OAuth de Google.

---

## 🔮 Fase 3 — Arquitectura Multi-tenant y SaaS (EN PROCESO)

### Objetivo
Permitir que el mismo código fuente ejecute múltiples "bots" independientes (clientes), cada uno con su propia configuración, base de datos local y tokens de API.

### Diseño y Tareas
- [x] Refactorización de `src/config/index.ts` para cargar configuraciones dinámicas basadas en `INSTANCE_ID`.
- [x] Aislamiento de las rutas de bases de datos locales (ej. `memory_${INSTANCE_ID}.db`).
- [x] Plantilla PM2 (`ecosystem.example.config.cjs`) para gestionar e iniciar múltiples clientes a la vez en el servidor.
- [ ] Nuevo comando opcional `/clave [GROQ|GEMINI] [api_key]` para que un usuario pueda sobreescribir la llave del cliente con la suya propia.

---

## 💼 Fase 4 — Panel de Control y Monetización (FUTURA)

### Objetivo
Crear una plataforma administrativa ("Admin Dashboard") para gestionar clientes, configurar sus tokens y cobrar suscripciones por el uso del bot.

### Funcionalidades
- **Frontend Admin**: Interfaz web (Angular/React/Vue o similar) para "Dar de alta" nuevos clientes visualmente.
- **Gestor de Pagos**: Integración con pasarelas de pago (ej. Stripe) para cobrar mensualidades.
- **Monitoreo**: Panel centralizado para ver el estado de salud, consumo de AI y uptime de cada instancia.

---

## 🐳 Fase 5 — Dockerización y Orquestación (FUTURA)

### Objetivo
Escalar la infraestructura para soportar cientos de clientes simultáneamente de forma segura y portable.

### Funcionalidades
- **Docker**: Crear un `Dockerfile` base para aislar las dependencias y procesos de SynergIA.
- **Orquestación**: Utilizar `docker-compose` o plataformas como Kubernetes para levantar y apagar bots automáticamente.
- [ ] **Pipelines CI/CD**: Despliegues automatizados que renueven los contenedores en producción sin afectar a los usuarios.

---

## ☁️ Fase 6 — Arquitectura Serverless y Escalamiento Masivo (+1000 Clientes) (FUTURA)

### Objetivo
Migrar la infraestructura a un modelo Serverless (ej. Google Cloud Run, AWS Lambda) para eliminar los costos fijos de servidores inactivos y manejar picos masivos de mensajes de forma automática y elástica.

### Funcionalidades
- [ ] **Migración a Webhooks**: Reemplazar WebSockets/Long Polling por Webhooks de Telegram para invocar las funciones Serverless únicamente cuando llega un mensaje nuevo.
- [ ] **Desacoplamiento de Base de Datos**: Reemplazar cualquier dependencia de archivos locales (como `memory.db` en SQLite) por bases de datos Cloud-Native (ej. Firestore, PostgreSQL, DynamoDB).
- [ ] **Sistema de Colas (Message Queue)**: Implementar Google Cloud Tasks o Pub/Sub para gestionar picos de tráfico y evitar los límites de tasa (*rate limit*: HTTP 429) de las APIs de IA (Groq/Gemini).
- [ ] **Configuración Totalmente Dinámica**: Cargar `API_KEYS` y configuración del tenant desde la base de datos o Secret Manager en milisegundos por cada mensaje, en lugar de archivos `.env`.

---

## 💡 Ideas y notas adicionales

- **Oracle Cloud Free Tier**: Alternativa gratuita para alojar en un VPS.
- **Modo público**: Evaluar si el bot de algún cliente se abre al público (requiere cuotas estrictas).

---

*Este archivo se actualiza con cada nueva fase del proyecto.*
