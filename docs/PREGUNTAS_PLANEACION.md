# Preguntas de Planificación - Arquitectura Multi-tenant SynergIA

---

## Pregunta 1: Estructura de Agentes

Cada agente (SynergIA, Tutor, etc.) ¿tendrá su propia carpeta con configuración independiente?

```
src/agents/
  synergia/
    config.json
    profile.json
  tutor/
    config.json  
    profile.json
```

---

## Pregunta 2: Base de Datos

¿Prefieres:

- **Opción A**: Una sola BD SQLite con tablas separadas por `agent_id` (más simple, tablas: users_*, plans_*, subscriptions_*)

- **Opción B**: Una BD SQLite por agente (más aislamiento, pero más complejo de gestionar)

```
Opción A (una BD):
  - users (agent_id, telegram_id, plan_id, ...)
  - plans (agent_id, name, price, ...)
  - subscriptions (user_id, agent_id, ...)

Opción B (múltiples BD):
  - memory_tutor.db
  - memory_ventas.db
  - memory_synergia.db
```

---

## Pregunta 3: Información del Agente

¿Qué información debe tener cada agente en su configuración?

| Campo | Dónde guardar? | Descripción |
|-------|----------------|-------------|
| Nombre del agente | JSON | ej: "Tutor CsAdmin PhD" |
| Descripción / Propósito | JSON | Qué hace este agente |
| System prompt | JSON | Personalidad del agente |
| Lista de herramientas | JSON | qué tools tiene disponibles |
| Perfil visual (avatar, colores) | JSON | Configuración visual |
| Usuarios/Suscriptores | DB | Lista de usuarios registrados |
| Planes disponibles | DB | Planes de suscripción |
| Estado de suscripción | DB | Quién tiene qué plan |
| Uso de recursos | DB | Cuántos requests ha usado |

---

## Pregunta 4: Relación Usuario-Agente

Un usuario puede estar suscrito a **múltiples agentes** o solo a **uno**?

- **Opción A**: Un usuario = Un agente (más simple)
- **Opción B**: Un usuario puede contratar varios agentes (más flexible)

---

## Pregunta 5: Estructura de Archivos Propuesta

```
SynergIA/
├── src/
│   ├── agents/
│   │   ├── synergia/
│   │   │   ├── config.json      # API keys, tokens específicos
│   │   │   └── profile.json     # Nombre, description, system_prompt
│   │   └── tutor/
│   │       ├── config.json
│   │       └── profile.json
│   ├── tools/                    # Herramientas globales
│   │   └── google.ts
│   ├── bot/
│   │   └── telegram.ts           # Un solo bot que routing según config
│   └── memory/
│       └── db.ts                 # Una BD con agent_id
├── docs/
│   └── PLANEACION.md            # Este documento
└── .env                         # Variables globales
```

---

## Pregunta 6: Modelo de Datos Propuesto (Opción A)

```sql
-- Agentes
CREATE TABLE agents (
  id TEXT PRIMARY KEY,           -- 'synergia', 'tutor', 'ventas'
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT,
  status TEXT DEFAULT 'active',
  created_at DATETIME
);

-- Planes por agente
CREATE TABLE plans (
  id TEXT PRIMARY KEY,           -- 'free', 'basic', 'premium'
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  monthly_requests INTEGER,
  price_monthly REAL,
  features TEXT,                -- JSON: {"docs": true, "voice": true}
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Usuarios (suscriptores)
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  telegram_id INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  plan_id TEXT DEFAULT 'free',
  status TEXT DEFAULT 'active',
  name TEXT,
  username TEXT,
  created_at DATETIME,
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

-- Uso por período
CREATE TABLE user_usage (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  requests_count INTEGER DEFAULT 0,
  period_start DATETIME,
  period_end DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## Próximo Paso

Responder las preguntas y creamos el plan detallado de implementación.

---

*Documento creado: 27 de marzo de 2026*
