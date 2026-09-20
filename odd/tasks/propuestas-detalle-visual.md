# Propuestas Formal — visual del modal Ver detalle

## Goal

Actualizar el modal abierto desde «Ver detalle» en Propuestas Formales para que siga la referencia visual compartida: encabezado con título/subtítulo y cierre visible, tarjetas de información en dos columnas, jerarquía tipográfica clara y footer separado; mantener compatibilidad con tema claro y oscuro.

## Scope

- `frontend/propuestas-listado/propuestas-listado.js`
- `frontend/propuestas-listado/propuestas-listado.css`
- `frontend/propuestas-listado/propuestas-listado.test.js` (solo si agrega valor para preservar contrato del modal)
- `frontend/shared/theme-dark.css` (solo si se requiere un override puntual para el modal nuevo)

## Plan

1. Relevar el markup/estilos actuales y el sistema de tokens de ambos temas.
2. Implementar el modal de detalle visualmente alineado con la referencia sin cambiar datos ni acciones.
3. Cubrir responsive, foco, cierre y legibilidad en dark mode.
4. Ejecutar tests focalizados, lint/format aplicables y revisar diff.

## Non-goals

- No cambiar endpoints, datos, permisos, acciones de fila ni comportamiento de Historial.
- No tocar cambios concurrentes ajenos en el working tree.
- No commit ni deploy.

## Status

- [x] Implementación — modal visual rediseñado con header, tarjetas, footer, cierre accesible y soporte claro/oscuro.
- [x] Verificación — tests focalizados, ESLint y Prettier pasan; validación visual detectó y se corrigió scroll móvil y foco post-cierre. El archivo completo mantiene un fallo preexistente ajeno: falta el link «Nueva propuesta».

## Evidence

- `frontend/propuestas-listado/propuestas-listado.js`: markup del modal, iconos, cierre visible y restauración de foco al trigger recreado.
- `frontend/propuestas-listado/propuestas-listado.css`: layout 2 columnas, responsive a 1 columna y scroll para viewport pequeño.
- `frontend/shared/theme-dark.css`: superficies y bordes del modal/tarjetas/footer en dark mode.
- Tests focalizados del modal: pasan; `acciones.test.js`: 5/5; ESLint y Prettier de superficies tocadas: pasan.
- Verificación browser desktop/mobile/light/dark: el layout desktop y el stack mobile quedaron correctos; el footer quedó alcanzable a 390×700 y el foco se restaura al trigger recreado. Screenshot: `C:\\tmp\\propuestas-detalle-390x700.png`.
- Tests: 8/9 pasan; el único fallo es el test preexistente del link `Nueva propuesta` en `frontend/propuestas-listado/propuestas-listado.test.js`.
- ESLint pasa. Prettier pasa en las tres superficies nuevas; `theme-dark.css` difiere solo por CRLF/LF preexistente y su contenido normalizado coincide.
