# 🧠 SynergIA — Hoja de Ruta del Proyecto

> Documento de seguimiento de avances y próximas fases de desarrollo.
> Actualizado: 2026-03-27

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

## ✅ Fase 2 — Estabilidad y despliegue (COMPLETADA)

- [x] Refactorización de `src/config/index.ts` para configuraciones dinámicas por `INSTANCE_ID`.
- [x] Aislamiento de bases de datos locales (`memory_${INSTANCE_ID}.db`).
- [x] Plantilla PM2 para gestionar múltiples clientes.
- [x] Perfiles de agente configurables (JSON).
- [x] Sistema de capacidades por agente.
- [x] Subir el proyecto a GitHub.

---

## ✅ Fase 3 — Base Multi-tenant (COMPLETADA)

### Objetivo
Sistema de usuarios dinámico con planes de suscripción y cuotas de uso.

### Tareas cumplidas
- [x] **Sistema de registro de usuarios**: Comando `/start` interactivo con persistencia en tabla `users`.
- [x] **Sistema de planes de suscripción**: Tabla `plans` con límites mensuales configurables (Freemium, Básico, Premium).
- [x] **Middleware de cuotas de uso**: Verificación de límites en tiempo real y contador de mensual de requests.
- [x] **Flujo de onboarding**: Menú de selección de plan y asignación automática de cuotas.
- [x] **Monitoreo Administrativo**: Herramienta `get_bots_summary` para auditar salud y consumo de todas las instancias desde SynergIA.
- [x] **Alertas de Consumo**: Notificaciones automáticas al usuario al alcanzar el 90% de su plan.
- [x] **Documentación de Usuario**: Creación del primer Manual de Usuario de SynergIA como patrón para futuros bots.

---

## 🔄 Fase 4 — Aislamiento de Datos e Inteligencia Avanzada (EN PROGRESO)

### Objetivo
Documentos privados por usuario en Google Drive y mejora de precisión (RAG).

### Tareas
- [ ] **RAG de Alto Rendimiento (Especialización Tutor)**: Búsqueda vectorial para procesar bibliografía extensa.
- [ ] **Estructura de carpetas privadas**: Carpeta por usuario en Drive autogestionada.
- [ ] **Herramienta de Drive personalizada**: Sincronización individualizada para cada cliente.

---

## 🔮 Fase 5 — Orquestación IA (FUTURA)

### Objetivo
SynergIA como gateway de modelos IA para agentes especializados.

### Tareas

- [ ] **Pipeline de orquestación**
  - [ ] Agente especializado → SynergIA (prompt optimizado) → Respuesta
  - [ ] Sistema de formateo de respuestas por tipo de agente

- [ ] **Gateway de modelos**
  - [ ] SynergIA como centro de distribución de IA
  - [ ] Groq, OpenRouter, Anthropic como proveedores
  - [ ] Rate limits por agente/usuario

- [ ] **Optimización de costos**
  - [ ] Cache de respuestas para preguntas frecuentes
  - [ ] Historial optimizado (truncar cuando sea necesario)

---

## 🔮 Fase 6 — SaaS Completo (FUTURA)

### Objetivo
Sistema completo de suscripción con facturación y métricas.

### Tareas

- [ ] **Panel de estadísticas**
  - [ ] Usuarios por agente
  - [ ] Requests por plan
  - [ ] Revenue estimado

- [ ] **Sistema de facturación**
  - [ ] Integración con Stripe/PayPal
  - [ ] O Telegram Bot Payments
  - [ ] Registro manual de pagos

- [ ] **Dashboard admin**
  - [ ] Gestión visual de agentes
  - [ ] Gestión de usuarios
  - [ ] Configuración de planes

---

## 🐳 Fase 7 — Dockerización y Escalamiento (FUTURA)

### Objetivo
Escalar para soportar cientos de clientes.

### Tareas

- [ ] **Docker**: Crear `Dockerfile` base.
- [ ] **Orquestación**: docker-compose o Kubernetes.
- [ ] **CI/CD**: Pipelines de despliegue automatizado.

---

## ☁️ Fase 8 — Arquitectura Serverless (FUTURA)

### Objetivo
Migrar a modelo serverless para eliminar costos fijos.

### Tareas

- [ ] **Webhooks**: Reemplazar long-polling por webhooks de Telegram.
- [ ] **DB Cloud-Native**: Firestore o PostgreSQL (Cloud SQL).
- [ ] **Message Queue**: Cloud Tasks/Pub/Sub para picos de tráfico.
- [ ] **Secret Manager**: Cargar API keys dinámicamente.

---

## 📋 Resumen de Fases

## 📋 Resumen de Fases

| Fase | Nombre | Estado |
|------|--------|--------|
| 1 | Bot funcional local | ✅ Completada |
| 2 | Estabilidad y despliegue | ✅ Completada |
| 3 | Base Multi-tenant | ✅ Completada |
| 4 | Aislamiento de Datos | ⏳ Próxima |
| 5 | Orquestación IA | 🔮 Futura |
| 6 | SaaS Completo | 🔮 Futura |
| 7 | Dockerización | 🔮 Futura |
| 8 | Serverless | 🔮 Futura |

---

*Este archivo se actualiza con cada nueva fase del proyecto.*
