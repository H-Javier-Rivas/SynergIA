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

- [ ] **Renovar el token OAuth de Gmail** (`gog.exe`).
  - El token actual ha expirado (`invalid_grant`).
  - Reautenticar la herramienta de envío de correos.

---

## 🔮 Fase 3 — Multi-usuario con créditos independientes (FUTURA)

### Objetivo
Permitir que cada usuario autorizado use **sus propias claves de API**, de modo que los créditos de IA sean independientes.

### Diseño propuesto
- Nuevo comando: `/clave [GROQ|GEMINI] [api_key]` para que cada usuario configure su propia llave.
- Tabla en Firestore: `user_config` con las llaves cifradas por usuario.
- El motor del agente (`loop.ts`) consultará primero si el usuario tiene su propia llave antes de usar la llave maestra.

---

## 💡 Ideas y notas adicionales

- **Oracle Cloud Free Tier**: Alternativa gratuita para alojar en un VPS si Railway presenta limitaciones.
- **Modo público**: Evaluar si en algún momento se abre el bot a usuarios no autorizados (requiere sistema de cuotas).
- **Panel de administración**: Una pequeña interfaz web para ver el historial de conversaciones y gestionar usuarios autorizados.

---

*Este archivo se actualiza con cada nueva fase del proyecto.*
