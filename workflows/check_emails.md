---
description: Al recibir el comando /start de Telegram, busca y resume los correos no leídos y los eventos del día.
triggers:
  - "/start"
---

# Workflow: Bienvenida y Agenda Diaria

Este workflow se activa automáticamente cuando el usuario inicia el bot SynergIA con el comando `/start`.

## Pasos a seguir:

1. **Saludo Inicial**: Saluda al usuario de forma cálida como "SynergIA" y confirma que estás revisando su bandeja de entrada y calendario.
2. **Revisión de Correos**: Utiliza la herramienta `gmail_search` con el filtro `is:unread` para encontrar los últimos 5 mensajes.
3. **Revisión de Calendario**: Utiliza la herramienta `calendar_get_events` para obtener los eventos de hoy (desde las 00:00 hasta las 23:59 del día actual).
4. **Procesamiento**:
   - Resume los correos indicando remitente y asunto.
   - Lista los eventos del día con sus horarios.
5. **Respuesta final**: Presenta toda la información de forma impecable usando HTML para negritas o cursivas. Pregunta si desea profundizar en algún punto o realizar otra tarea.
