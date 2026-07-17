# Handoff: Login Aseguradora Tajy — 3 fondos finalistas (3a / 3b / 3c)

## Overview
Pantalla de login para el cotizador de pólizas de Aseguradora Tajy. Reinterpretación propia (no calco) de un login de referencia de un compañero: misma idea general (tarjeta centrada, usuario/contraseña, botón, footer institucional) pero con composición, iconografía y detalles propios. Se armaron 3 variantes de fondo a pantalla completa sobre la misma tarjeta — el objetivo de este handoff es implementar las 3 para elegir una en producto real, o dejarlas como fondos alternables.

## About the Design Files
Los archivos de esta carpeta son **referencias de diseño en HTML** (un prototipo hecho como Design Component), no código para copiar tal cual. La tarea es **recrear este diseño en el entorno real del proyecto** (React, Vue, etc. — lo que ya use la app) usando sus propios patrones, sistema de componentes y manejo de formularios/autenticación existente.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, espaciados e interacciones (hover, focus, toggle de contraseña) están definidos y deben respetarse tal cual.

## Screens / Views

Las 3 variantes comparten exactamente la misma tarjeta central; solo cambia el fondo de pantalla completa detrás de ella.

### Tarjeta de login (común a las 3 variantes)
- Contenedor: `340px` de ancho, fondo blanco `#ffffff`, `border-radius: 16px`, `padding: 36px 32px 28px`, centrada vertical y horizontalmente en el viewport.
- Sombra por variante (ver abajo); en **hover** la tarjeta sube `translateY(-4px)` y la sombra se intensifica (transición `0.25s ease` en `transform` y `box-shadow`).
- **Pestaña roja superior**: un pill de `56×8px`, `border-radius: 6px`, color `#d8132e`, centrado horizontalmente, sobresaliendo del borde superior de la tarjeta (posicionado a mitad fuera de la tarjeta vía `translate(-50%,-50%)`).
- **Logo**: `assets/logo-rojo-con-negro.svg`, ancho `80px`, centrado, `margin-bottom: 20px`. En hover escala a `1.06` (transición `0.25s ease`).
- **Título** "Bienvenido": `20px / 800 / #191919`, `letter-spacing: -0.01em`, centrado, `margin-bottom: 6px`.
- **Subtítulo** "Ingresa tus credenciales para continuar": `13.5px / #767a80`, centrado, `margin-bottom: 22px`.
- **Label "Usuario"**: `12.5px / 600 / #40444a`, `margin-bottom: 6px`.
- **Input Usuario**: placeholder "Tu usuario", `padding: 11px 13px`, `border: 1.5px solid #e4e5e8`, `border-radius: 10px`, `font-size: 13.5px`, `margin-bottom: 14px`.
- **Label "Contraseña"**: mismo estilo que label Usuario.
- **Input Contraseña con toggle mostrar/ocultar**:
  - Wrapper `position: relative`.
  - Input: mismo estilo que Usuario pero `padding-right: 40px` para dejar lugar al ícono, tipo dinámico `password` / `text`.
  - Botón ícono (ojo) posicionado absoluto a la derecha, `30×30px`, sin fondo/borde, color `#8a8f96`, `border-radius: 6px`, `cursor: pointer`.
  - Ícono "ojo abierto" (mostrar) cuando la contraseña está oculta; ícono "ojo tachado" cuando está visible. Ambos son SVG `18×18`, `stroke-width: 1.7`, `stroke: currentColor`, sin relleno.
  - Al hacer click alterna el `type` del input entre `password` y `text` y cambia el ícono.
- **Link** "¿Olvidaste tu contraseña?": alineado a la derecha, `11.5px / 600`, color `#d8132e`, hover `#a80f24`, sin subrayado, `margin-bottom: 18px`.
- **Botón "Ingresar"**: ancho 100%, `padding: 12px`, fondo `#d8132e`, texto blanco `14px / 700`, `border-radius: 10px`, sin borde.
  - Hover: fondo `#b80f26`, `translateY(-1px)`, `box-shadow: 0 8px 20px rgba(216,19,46,.35)`.
  - Active (click): vuelve a `translateY(0)`, sombra `0 3px 8px rgba(216,19,46,.3)`.
  - Transición `0.2s ease` en `background`, `transform`, `box-shadow`.
- **Footer**: "Aseguradora Tajy Prop. Coop. S.A", `10.5px / #a4a8ad`, centrado, `margin-top: 20px`.

### Variante 3a — Gris claro + formas geométricas
- Fondo de pantalla completa: `#f0eee9` sólido.
- Formas decorativas (todas en rojo institucional, muy sutiles, `position: absolute`, detrás de la tarjeta):
  - Círculo relleno `280×280px` arriba a la derecha, offset `-70px` en top/right, color `rgba(216,19,46,.06)`.
  - Círculo solo borde `220×220px` abajo a la izquierda, offset `-90px`/`-60px`, `border: 1px solid rgba(216,19,46,.15)`.
  - Círculo relleno pequeño `90×90px`, posición `bottom:40px; left:180px`, color `rgba(216,19,46,.05)`.
- Sombra de tarjeta: `0 12px 32px rgba(0,0,0,.1)`; en hover `0 20px 40px rgba(0,0,0,.16)`.

### Variante 3b — Diagonal rojo sólido
- Fondo de pantalla completa: `#fafafa`.
- Forma diagonal roja sólida (`#d8132e`) cubriendo el 55% derecho de la pantalla, con `clip-path: polygon(35% 0, 100% 0, 100% 100%, 0 100%)` (borde diagonal limpio, sin curvas ni gradiente).
- Sombra de tarjeta: `0 16px 40px rgba(0,0,0,.15)`; en hover `0 22px 48px rgba(0,0,0,.22)` (más pronunciada que 3a por el mayor contraste de fondo).

### Variante 3c — Malla de puntos + acento rojo
- Fondo de pantalla completa: `#fbfaf9`.
- Patrón de puntos: SVG con `<pattern>` de `26×26px`, un punto (`circle r="1.4"`) por celda, color `#d8132e`, `opacity: .18`; el SVG completo se aplica con `opacity: .5` sobre toda la pantalla.
- Resplandor: círculo `340×340px` abajo a la derecha (offset `-120px`/`-120px`), `background: radial-gradient(circle, rgba(216,19,46,.12), rgba(216,19,46,0) 70%)`.
- Sombra de tarjeta: `0 12px 32px rgba(0,0,0,.1)`; en hover `0 20px 40px rgba(0,0,0,.16)`.

## Interactions & Behavior
- **Hover de tarjeta**: elevación + sombra más marcada (ver por variante arriba).
- **Hover de logo**: escala `1.06`.
- **Hover/active de botón Ingresar**: ver estilo del botón arriba.
- **Toggle de contraseña**: click en el ícono de ojo alterna visibilidad del texto ingresado (sin submit, sin recargar).
- **Focus de inputs**: borde `#d8132e`, `box-shadow: 0 0 0 3px rgba(216,19,46,.12)`.
- Sin animaciones de entrada/transición de página definidas — el foco de este handoff es la pantalla estática y sus micro-interacciones.

## State Management
- `showPassword: boolean` (por input de contraseña) — controla `type` del input (`password` / `text`) y qué ícono se muestra.
- Estado de formulario (usuario, contraseña) y su validación/submit quedan a criterio del desarrollador según el backend de autenticación existente.

## Design Tokens
- **Rojo principal**: `#d8132e` (botón, acentos, links, formas de fondo)
- **Rojo hover botón**: `#b80f26`
- **Texto principal**: `#191919`
- **Texto secundario**: `#767a80`
- **Texto labels**: `#40444a`
- **Texto footer/placeholder**: `#a4a8ad` / `#a9adb3`
- **Bordes de input**: `#e4e5e8`
- **Tipografía**: Inter (400/500/600/700/800), fallback `system-ui, sans-serif`
- **Radios**: tarjeta `16px`, inputs/botón `10px`, ícono toggle `6px`
- **Ancho de tarjeta**: `340px`

## Assets
- `assets/logo-rojo-con-negro.svg` — isotipo/wordmark "Aseguradora Tajy", versión roja/negra provista por el usuario.
- Íconos de mostrar/ocultar contraseña: dibujados en SVG inline dentro del archivo de diseño (no son imágenes externas) — se pueden recrear con cualquier librería de íconos (ej. un ojo / ojo tachado estándar).

## Files
- `Login Tajy.dc.html` — prototipo completo. Las variantes finales a implementar son las secciones con id `3a`, `3b` y `3c` (buscar `id="3a"`, `id="3b"`, `id="3c"` en el archivo). El archivo también contiene exploraciones anteriores (`1a`–`1d`, `2a`–`2c`) que **no** forman parte de este handoff — se dejan solo como referencia de proceso.
