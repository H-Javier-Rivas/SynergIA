# Transición a SynergIA Bot Ecosystem v3.0.0

El objetivo es evolucionar el proyecto de un "bot singular" a un "Ecosistema de Bots Administrados", elevando la versión base del núcleo a `v3.0.0` y otorgando versiones individuales a cada bot gestionado. Además, robusteceremos las pruebas automáticas para abarcar las últimas mejoras de la Inteligencia Artificial y aseguraremos todo bajo control de versiones (Git).

## User Review Required

> [!IMPORTANT]
> Revisa la propuesta para el manejo de versiones de cada bot. En lugar de crear múltiples archivos `package.json` que romperían la arquitectura de PM2 y TypeScript actual, propongo inyectar el campo `version` y `description` directamente dentro de cada archivo de perfil (`src/config/profiles/estadistica.json`, `synergia.json`, etc.). El comando `/about` o `/version` leería esta propiedad. ¿Estás de acuerdo con este enfoque "pseudo-monorepo"?

## Open Questions

> [!NOTE]
> ¿Tienes configurado un repositorio remoto (por ejemplo, en GitHub o GitLab) al que deba hacer `git push` después de crear el commit y el tag de la versión `v3.0.0`, o solo realizo el control de versiones localmente?

## Proposed Changes

### Core Ecosystem (Motor Principal)

#### [MODIFY] [package.json](file:///c:/Users/USER/SynergIA/package.json)
- Actualizar `name` a `synergia-ecosystem`.
- Actualizar `version` a `3.0.0`.
- Actualizar `description` para reflejar que es un gestor de ecosistema de bots liderado por la IA administradora SynergIA.

### Bot Profiles (Versiones Individuales)

#### [MODIFY] [estadistica.json](file:///c:/Users/USER/SynergIA/src/config/profiles/estadistica.json)
- Añadir `"version": "1.0.0"`.
- Añadir `"description": "Bot especializado en tutorías de estadística."`.

#### [MODIFY] [synergia.json](file:///c:/Users/USER/SynergIA/src/config/profiles/synergia.json)
- Añadir `"version": "3.0.0"`. (Alineada con el núcleo al ser la administradora).
- Añadir `"description": "Asistente Personal y Administradora del Ecosistema."`.

#### [MODIFY] [tutor.json](file:///c:/Users/USER/SynergIA/src/config/profiles/tutor.json)
- Añadir `"version": "1.2.0"`.
- Añadir `"description": "Tutor general para acompañamiento académico."`.

### Core Logic

#### [MODIFY] [index.ts](file:///c:/Users/USER/SynergIA/src/config/index.ts)
- Actualizar la interfaz `Config` para cargar y exportar la versión individual del bot cargada desde el perfil.

#### [MODIFY] [basic.ts](file:///c:/Users/USER/SynergIA/src/bot/commands/basic.ts)
- Actualizar el comando `/about` (o crear `/version`) para que responda dinámicamente con la versión del bot específico y la versión del motor de ecosistema (SynergIA v3.0.0).

### Testing (Cobertura de Nuevas Funciones)

#### [NEW] [llm.test.ts](file:///c:/Users/USER/SynergIA/tests/llm.test.ts)
- Crear una nueva suite de pruebas para asegurar que el sistema de fallback de IA (Gemini Direct -> Groq -> OpenRouter) funcione como está diseñado sin regresiones.

### Control de Versiones

#### Comandos Git a Ejecutar
- `git add .`
- `git commit -m "chore: release SynergIA Ecosystem v3.0.0 con versionamiento multi-bot"`
- `git tag -a v3.0.0 -m "Release v3.0.0"`

## Verification Plan

### Automated Tests
- Ejecutar `npm run test` para validar que todas las pruebas (incluyendo las 33 ya existentes y la nueva `llm.test.ts`) pasen correctamente.

### Manual Verification
- Invocar el comando `/about` en Telegram con la cuenta del profesor para verificar que el "Tutor de Estadística" se presenta con su versión individual.
- Confirmar que `git status` indique que el árbol de trabajo está limpio y en la etiqueta `v3.0.0`.
