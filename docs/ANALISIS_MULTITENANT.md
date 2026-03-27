# 📊 ANÁLISIS DEL PROYECTO SYNERGIA - ARQUITECTURA MULTI-TENANT

## 1. RESUMEN EJECUTIVO

**Objetivo del Proyecto:**
- Agente de IA llamado SynergIA para asistir en creación de start-up
- Crear agentes especializados que manejen múltiples usuarios vía Telegram por suscripción
- Planes: Freemium (enganche), Básico, Premium
- Arquitectura Multi-tenant bajo tecnología SaaS

---

## 2. ESTADO ACTUAL DEL PROYECTO

### 2.1 Arquitectura Implementada

| Componente | Estado | Descripción |
|------------|--------|-------------|
| **Agentes** | ✅ Básico | SynergIA + Tutor (perfiles JSON) |
| **Usuarios** | ⚠️ Limitado | Lista blanca hardcodeada en `.env` |
| **Historial** | ✅ SQLite | Tabla `messages` con `user_id` |
| **Documentos** | ✅ Drive | Sincronización con carpetas compartidas |
| **IA** | ✅ Groq/OpenRouter | Integración en `loop.ts` |
| **Herramientas** | ✅ Registry | Sistema de plugins en `tools/index.ts` |
| **Multi-instancia** | ✅ PM2 | 2 bots separados |

### 2.2 Estructura de DB Actual

```sql
messages (id, user_id, role, content, tool_calls, tool_call_id, created_at)
user_prefs (user_id, audio_mode)
library_index (file_id, name, content, last_sync)
```

### 2.3 Archivos de Configuración

- `.env` → SynergIA (principal)
- `.env.tutor` → Tutor
- `src/config/profiles/synergia.json` → Perfil SynergIA
- `src/config/profiles/tutor.json` → Perfil Tutor
- `ecosystem.config.cjs` → Configuración PM2

---

## 3. ✅ PROS DE LA ARQUITECTURA ACTUAL

1. **Funciona** - Los agentes ya atienden usuarios en producción
2. **Separación de instancias** - SynergIA y Tutor usan bases de datos separadas (memory.db, memory_tutor.db)
3. **Perfiles configurables** - JSON permite personalidad y capacidades por agente
4. **Herramientas extensible** - Sistema de registry para agregar tools dinámicamente
5. **Contexto por usuario** - Historial individual en SQLite
6. **Experiencia previa** - Ya tienes usuarios atendidos y feedback real
7. **Autenticación Google** - Service Account configurado para Drive

---

## 4. ❌ CONTRA / LIMITACIONES ACTUALES

| Limitación | Impacto | Severidad |
|------------|---------|-----------|
| **Usuarios hardcodeados** | No permite registro dinámico | 🔴 Alta |
| **Un solo plan** | Sin Freemium/Premium | 🔴 Alta |
| **Sin cuotas de uso** | No hay control de consumo de IA | 🔴 Alta |
| **Drive compartido** | Documentos no privados por usuario | 🟠 Media |
| **Sin aislamiento real** | Solo DB separada, mismo código | 🟠 Media |
| **Sin billing/pagos** | No hay integración de pagos | 🔴 Alta |
| **Sin métricas** | No hay estadísticas por usuario/plan | 🟡 Baja |
| **Agentes fijos** | No se crean dinámicamente | 🟡 Baja |
| **Sin orquestación** | Tutor no pasa preguntas a SynergIA | 🟡 Baja |

---

## 5. 🔍 ANÁLISIS DE LA PROPUESTA MULTI-TENANT

### 5.1 Lo que propones vs Lo que hay actualmente

| Tu Propuesta | Estado Actual | Trabajo Requerido |
|--------------|---------------|-------------------|
| Múltiples agentes (Tutor, Ventas, Legal) | 2 agentes | Crear perfiles JSON + DB por agente |
| Suscripciones (Freemium, Básico, Premium) | Sin planes | Tabla `subscriptions` + lógica de verificación |
| Cuotas de uso (tokens, requests) | Sin control | Tabla `usage` + middleware de límites |
| Docs privados por usuario | Carpeta compartida | Estructura `/SynergIA/{agent}/{user_id}/` |
| Registro dinámico de usuarios | Lista blanca | Sistema `/start` + flujo de registro |
| Agente SynergIA como orquestador | Sin conexión | Pipeline: agente → SynergIA → respuesta formateada |
| Contexto por suscriptor | Historial existente | Ya existe, solo refinar por plan |

### 5.2 Flujo Propuesto de Usuario

```
1. Usuario nuevo → Le escribe al agente (Telegram)
2. /start → Menú de planes → Selecciona plan
3. Registro en DB → Asignación de carpeta Drive privada
4. Usuario interactúa → Agente procesa → Consulta SynergIA (si es necesario)
5. SynergIA responde → Agente formatea → Envía a usuario
6. Control de cuotas → Si excede → Upgrade de plan
```

---

## 6. 🛤️ ROADMAP RECOMENDADO

### FASE 1: BASE MULTI-TENANT (2-3 semanas)

**Objetivo:** Sistema de usuarios dinámico con planes de suscripción

- [ ] Sistema de registro de usuarios (comando `/start` interactivo)
- [ ] Tabla `users`: `id`, `telegram_id`, `agent_id`, `plan`, `created_at`, `status`
- [ ] Tabla `plans`: `id`, `name`, `monthly_requests`, `features`, `price`
- [ ] Sistema de verificación de plan antes de procesar mensaje
- [ ] Middleware de cuotas de uso (incrementar en cada request)

### FASE 2: AISLAMIENTO DE DATOS (1-2 semanas)

**Objetivo:** Documentos privados por usuario

- [ ] Estructura Drive: `/SynergIA/{agent}/{user_id}/`
- [ ] Herramienta de Drive personalizada (recibe user_id, retorna carpeta propia)
- [ ] Separación de historial por usuario+agente en queries
- [ ] Tabla `user_folders`: `user_id`, `drive_folder_id`

### FASE 3: ORQUESTACIÓN IA (2 semanas)

**Objetivo:** Tutor → SynergIA como gateway de IA

- [ ] Pipeline: Agente especializado → SynergIA (prompt optimizado) → Respuesta
- [ ] SynergIA: Gateway de modelos (Groq, OpenRouter, Anthropic)
- [ ] Sistema de formateo de respuestas por tipo de agente
- [ ] Cache de respuestas para optimizar costos

### FASE 4: SAAS COMPLETO (3-4 semanas)

**Objetivo:** Sistema completo de suscripción

- [ ] Panel de estadísticas por agente (usuarios, requests, revenue)
- [ ] Sistema de facturación (Stripe/PayPal o Telegram Bot Payments)
- [ ] Dashboard admin web (opcional, puede ser comandos Telegram)
- [ ] Sistema de INVITACIONES (códigos para atraer usuarios)

---

## 7. 💡 PREGUNTAS CLAVE ANTES DE IMPLEMENTAR

### Pregunta 1: ¿Cuántos agentes planeas tener inicialmente?
- Tutor (ya existe)
- ¿Ventas?
- ¿Legal?
- ¿Soporte?

### Pregunta 2: ¿Cómo será el flujo de registro?
- Opción A: El usuario le escribe al agente → `/start` → selecciona plan → código de invitación
- Opción B: Enlace público por agente → redirección a Telegram

### Pregunta 3: ¿Los usuarios pagan a través de qué medio?
- Telegram Bot Payments (integrado en Telegram)
- Stripe/PayPal externo
- Transferencia manual ( registrar manualmente)

### Pregunta 4: ¿SynergIA como orquestador?
- Todas las preguntas pasan por SynergIA (para optimizar prompts)
- Solo las difíciles pasan a SynergIA (agente decide)

### Pregunta 5: ¿Timeline esperado?
- MVP funcional: 1 mes
- Versión completa: 3 meses

---

## 8. 📋 RESUMEN COMPARATIVO

| Aspecto | Actual | Propuesta |
|---------|--------|-----------|
| Usuarios | 1-2 hardcoded | Miles dinámicos |
| Planes | No | Freemium/Básico/Premium |
| Documentos | Compartidos | Privados por usuario |
| IA | Groq directo | SynergIA como gateway |
| Pagos | No | Sí |
| Métricas | No | Sí |
| Registro | Admin manual | Automático con /start |

---

## 9. PRIORIDADES INMEDIATAS

Basado en el análisis, las prioridades para comenzar:

1. **Sistema de usuarios dinámicos** - Ya no depender de lista blanca
2. **Tabla de planes y suscripciones** - Base del modelo de negocio
3. **Middleware de cuotas** - Controlar costos de IA
4. **Estructura de carpetas privadas** - Aislamiento de datos

---

*Documento generado: 27 de marzo de 2026*
*Proyecto: SynergIA - Asistente Multi-tenant SaaS*
