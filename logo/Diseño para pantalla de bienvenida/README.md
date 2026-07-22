# Handoff: Pantalla de Bienvenida (post-login)

## Overview
Pantalla que se muestra justo después del login. Saluda al agente y le pide elegir entre dos acciones: **Cotizar una Póliza** (despliega selector de ramo, luego navega a `/frontend/cotizar/?ramo=...`) o **Elaborar una Propuesta Formal** (hoy placeholder "Próximamente").

## Sobre los archivos de diseño
Los `.dc.html` adjuntos son **referencias de diseño**, construidos con un runtime propio (React + un motor de templates) que **no existe en el codebase real** (`Produccion/frontend`), el cual es HTML/CSS/JS plano con módulos ES (ver `login.js`, `cotizar.js`, `sidebar.js`). Hay que **recrear este diseño en ese mismo estilo**: HTML estático + un archivo `.js` de módulo + reutilizar `shared/cotizador.css` y el patrón de `login-fx.js`, tal como hacen las demás pantallas del proyecto. No copiar el HTML tal cual — no va a funcionar sin el runtime.

## Fidelidad
**Alta fidelidad**: colores, tipografía, espaciado y layout son finales. Hay dos versiones — el equipo debe elegir cuál implementar (probablemente v2):
- `Bienvenida-v1.dc.html`: fondo diagonal rojo (igual al login), panel blanco centrado, cards 280px lado a lado.
- `Bienvenida-v2.dc.html`: fondo neutro claro con glow rojo sutil en la esquina, layout más ancho tipo SaaS, cards con ícono grande y flecha de affordance. **Es la versión final aprobada.**

## Pantallas / Estados (v2, la aprobada)

### 1. Bienvenida (estado inicial)
- Contenedor: `max-width: 1000px`, centrado, padding `36px 40px 56px`.
- Header: logo `assets/logo-rojo-con-negro.svg` a 50px de alto (izquierda) + saludo discreto a la derecha: `Hola, <b>{nombre}</b>` — 13px, color `#8a8a8a`, nombre en `#191919` peso 700.
- Título: "¿Qué querés hacer?" — Sora 800, 26px, `#191919`.
- Subtítulo: "Elegí una opción para continuar." — 14.5px, `#8a8a8a`, margin-bottom 32px.
- Grid de 2 columnas (`display:grid; grid-template-columns:1fr 1fr; gap:20px`), cada card:
  - `background:#fff; border:1px solid #e8e6e3; border-radius:20px; padding:32px`
  - `box-shadow:0 1px 2px rgba(0,0,0,.04)`; hover: `translateY(-3px)`, `box-shadow:0 20px 40px rgba(0,0,0,.1)`, `border-color:#191919`
  - Fila superior: chip de ícono 52×52px, `border-radius:14px`, `background:#fbeaea`, ícono `color:#d8132e` 26px — y a la derecha una flecha (↗) `#c9c7c4` que sugiere click.
  - Título de card: Sora 700, 18px, `#191919`.
  - Descripción: 13.5px, `#8a8a8a`, line-height 1.5.
  - **Card 1** — "Cotizar una Póliza" / "Cotizá una póliza con nosotros en minutos." → onClick pasa al estado "ramo".
  - **Card 2** — "Elaborar una Propuesta Formal" / "Armá el expediente completo con KYC/PLA-FT ya aceptado por el cliente." → onClick pasa al estado "propuesta".

### 2. Selector de ramo (tras elegir "Cotizar una Póliza")
- Botón "Volver" (flecha izq + texto, `#8a8a8a`, 13px 600) vuelve al estado bienvenida.
- Título "Elegí el ramo" (Sora 800, 22px) + subtítulo.
- Lista vertical de filas (`gap:8px`), cada fila: ícono 38×38 en chip gris `#f7f6f5`, nombre del ramo (14px 600 `#191919`), badge de estado a la derecha (verde `#1e8a4c` "Disponible" / gris `#999` "En pausa" o "Próximamente").
- Ramos disponibles (navegan a `../cotizar/?ramo=<slug>`): Multirriesgo Comercio (`mrc`), Incendio (`incendio`), Vida y Accidentes Personales (`vida-ap`).
- Ramos deshabilitados (opacity .5, cursor not-allowed, sin link): Auto Individual ("En pausa"), Multirriesgo Hogar ("Próximamente").

### 3. Propuesta Formal (placeholder)
- Botón "Volver".
- Ícono de reloj en círculo gris 56px.
- Título "Próximamente" (Sora 800, 20px).
- Texto: "La Propuesta Formal con KYC/PLA-FT todavía está en desarrollo. Por ahora podés generar la Carta Oferta desde el cotizador." (13.5px, `#8a8a8a`).

## Interacciones y comportamiento
- Transición entre estados: fade-in + translateY sutil (`bvFadeIn`, 300ms).
- Todo dentro de un solo componente con 3 estados: `welcome | ramo | propuesta`. No hay navegación de URL entre ellos — es un mismo archivo/página que cambia de vista.
- Fondo: canvas con partículas animadas reactivas al mouse — mismo motor que ya existe en `frontend/login/login-fx.js`. En v2 el efecto está confinado a un glow circular en la esquina superior derecha (no a toda la pantalla).

## Design tokens (ya existentes en el proyecto — reusar, no reinventar)
- Rojo marca: `#d8132e` (hover `#a80f24`)
- Negro texto: `#191919`
- Gris secundario: `#8a8a8a`
- Fondo página: `#f7f6f5`
- Borde sutil: `#e8e6e3`
- Verde disponible: `#1e8a4c`
- Tipografía: `Sora` (títulos, 600–800) + `Public Sans` (cuerpo, 400–700)
- Radios: cards 20px, chips de ícono 14px, filas de lista 14px, chips pequeños 10px

## Assets
- `assets/logo-rojo-con-negro.svg` (ya está en `Produccion/logo/`)
- Íconos: SVGs de línea inline (stroke 1.7–1.8, `stroke-linecap:round`), estilo consistente con `frontend/shared/nav-icons.js` — se puede migrar a ese archivo para reutilizarlos.

## Dónde integrarlo en el codebase
- Debe mostrarse **inmediatamente después de un login exitoso**, antes de entrar a `frontend/cotizar/`. Sugerido: nueva carpeta `frontend/bienvenida/` con `index.html` + `bienvenida.js`, siguiendo el mismo patrón de `frontend/login/` (`index.html` + `login.js` + import de `shared/api.js` para leer el nombre del agente logueado vía `auth`).
- El selector de ramo debe enlazar a las rutas reales que ya usa `frontend/cotizar/` para preseleccionar ramo (confirmar el nombre del query param con el equipo si no es `?ramo=`).

## Archivos
- `Bienvenida-v1.dc.html`, `Bienvenida-v2.dc.html` — referencias de diseño (no ejecutables en el codebase real, ver arriba).
