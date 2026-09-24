# Propuesta Formal MRC — páginas dinámicas en el PDF (v3)

## Objetivo

El renderer v3 (`backend/src/templates/propuesta/mrc-v3.js`, único renderer activo para
propuestas nuevas — `PROPUESTA_FORMAL_RENDERER_REVISION = PROPUESTA_FORMAL_V3_RENDERER_REVISION`)
genera exactamente 2 páginas A4 fijas. El contenido variable (descripción de riesgo, lista de
coberturas, textos legales publicados) se fuerza a entrar en esas 2 páginas con un sistema de
"fit" que va achicando el font-size hasta un mínimo (`waitForProposalFit` en
`backend/src/services/propuesta-pdf.service.js`). Cuando ni el mínimo alcanza, tira
`ProposalFitOverflowError` (código `PF_PDF_FIT_OVERFLOW`) y la emisión falla con 500.

Objetivo: que el documento pueda crecer a 3+ páginas A4 cuando el contenido real no entra en 2,
en vez de seguir exprimiendo el font-size hasta romperse. El header/footer de marca (foto de
fondo, logo, franja roja, grilla de metadatos) debe repetirse con fidelidad completa en TODAS
las páginas, incluidas las nuevas — decisión explícita de Kevin (no un header simplificado).

## Por qué

Kevin reportó un 500 real al emitir una Propuesta Formal MRC en TEST (carta id=12, propuesta
N°13): 11 coberturas + descripción de riesgo de 5 líneas hacen desbordar la caja de
"Declaraciones" de la página 1 incluso al mínimo de fuente (6px), aun después del fix de esta
misma mañana para el mismo box (memoria Engram #1696). Confirmado con Kevin que el flujo real
puede tener ese volumen de contenido o más — no es un caso de prueba aislado. Seguir
comprimiendo el layout es un parche que se vuelve a romper con más contenido; la solución
duradera es dejar de fijar la cantidad de páginas.

## Alcance

- Solo el renderer v3 de MRC (`mrc-v3.js` + su uso en `propuesta-pdf.service.js`).
- v1 (`mrc.js`) y v2 no se tocan — son legacy, solo sirven para redescargar propuestas ya
  emitidas con esos renderers congelados en su `snapshot.renderer_identity.revision`.
- No cambia el endpoint, el schema, las validaciones de negocio ni el contenido de los textos
  legales — solo cómo se paginan/renderizan.

## Restricciones

- No commitear/pushear sin que Kevin lo pida explícitamente (regla del proyecto: siempre
  rama + PR, nunca push directo a main).
- No tocar archivos en los que Codex está trabajando en paralelo (issue #87 P0: roles, ajustes
  de primas, cookies TEST/PROD, backup) — sin solape de archivos hasta ahora, revalidar si
  aparece.
- Verificación visual real (PDF generado y revisado, no solo tests) antes de dar por cerrada
  cualquier tarea que toque el layout.

## Decisión de enfoque (confirmada con Kevin)

- Páginas dinámicas: sí, en vez de seguir comprimiendo con el sistema de "fit" actual.
- Fidelidad del header/footer en páginas 3+: **completa**, no un header simplificado. Implica
  adoptar una librería de paginado CSS con headers/footers corridos (candidata: Paged.js) en
  vez de depender únicamamente de `page.pdf()` de Puppeteer con `headerTemplate`/`footerTemplate`
  (que corre en un contexto aislado con CSS muy limitado y no podría reproducir el diseño actual).

## Tareas

- [x] 1. Spike de validación técnica: prototipo aislado que confirmó que Paged.js corre dentro
      de Puppeteer headless (mismo puppeteer ^25.10.0 del backend) y repite el header/footer de
      marca real (imagen de fondo + 3 gradientes + logo + footer con slogan) con fidelidad
      completa en 3 páginas A4 generadas dinámicamente a partir de contenido de relleno (25 filas + 40 párrafos). `break-inside: avoid` respetó filas de cobertura sin cortarlas.
      Mecanismo confirmado: `position: running(nombre)` en el header/footer real +
      `@page { @top-center: element(nombre); @bottom-center: element(nombre) }`.
      Gotcha real: sin `preferCSSPageSize: true` en `page.pdf()`, Chromium ignora
      `@page { size: A4 }` y sale en tamaño Letter sin ningún error — hay que setear ese flag
      explícito en la tarea 4. No hay un evento documentado "terminó de paginar" en el bundle
      minificado; la API pública real es `PagedConfig.after` (hook `afterRendered`), preferible
      a un polling manual para la tarea 4. Evidencia en el scratchpad del spike (no en el repo).
- [x] 2. Diseñado el nuevo modelo de paginado en `PROPUESTA_FORMAL_V3_STYLE`: `@page` con
      `margin: 46mm 0 21mm` + `@top-center`/`@bottom-center` apuntando a los running elements
      `pfHeader`/`pfFooter` (`.proposal-header`/`.proposal-footer` con `position: running(...)`,
      una sola copia en el markup). Se sacaron `.proposal-page` fijo (297mm/overflow:hidden) y
      los 2 `<article>`; el contenido vive en un solo `.proposal-body` en flujo continuo. El
      "Página X de Y" ya no es texto server-side — se resuelve con `counter(page)`/`counter(pages)`
      vía `.header-page::after` dentro del propio running header (confirmado que los contadores
      CSS sí se recalculan por instancia física aunque vivan en un elemento running).
- [x] 3. Reescritas `riskTable`, `declarations-box`, `conditions-box`, `principal-coverages-box`,
      `collection-clause`: sin `data-fit-*`/`fit-box`/`fit-flex`, contenido en flujo normal con
      font-size fijo (8px / 7.5px para collection-clause) y `break-inside: avoid` en los bloques
      atómicos (filas de `risk-columns`, párrafos legales, `.coverage-*-block`, `.finance-card`,
      `.payment-row-shell`, `.signatures`, `.observations`, `.insured-card`, `.modality`,
      `.section-heading` con `break-after: avoid-page` para no dejar un título huérfano).
- [x] 4. `propuesta-pdf.service.js`: nuevo `waitForProposalV3Ready()` que inyecta el polyfill real
      de Paged.js (`getPagedJsPolyfillSource()`, resuelto vía `import.meta.resolve('pagedjs')` +
      navegación a `dist/paged.polyfill.js` — necesario porque el paquete no expone esa ruta en su
      `exports` y el monorepo con workspaces puede hoistear `pagedjs` fuera de
      `backend/node_modules`) y espera `document.documentElement.dataset.proposalFit === 'complete'`,
      seteado por el propio HTML vía `window.PagedConfig.after` (API pública documentada de
      Paged.js). `printV3ProposalPdf()` ahora usa `preferCSSPageSize: true` (sin `format`/`margin`
      fijos — los da el `@page` del CSS). v1/v2 y `ProposalFitError`/`ProposalFitOverflowError`/
      `FIT_SECTION_IDS`/`waitForProposalFit` quedaron intactos (los sigue usando v1).
- [x] 5. `mrc-v3.test.js` reescrito (23 tests, todos en verde) para el contrato nuevo: 1 sola copia
      de header/footer, sin fit-attrs, `break-inside: avoid` en los bloques atómicos, contadores
      CSS de página. Se agregó el test de regresión con el caso real que rompía (11 coberturas +
      descripción de riesgo de 5 líneas + los 3 textos de Declaraciones con longitud real
      combinada ~5880 caracteres) verificando que el HTML server-side ya no tiene ningún límite
      que pueda rechazarlo. `propuesta-pdf.service.test.js`: actualizado el test v3 + 2 tests
      nuevos para `waitForProposalV3Ready`/`getPagedJsPolyfillSource`.
- [x] 6. `pagedjs@^0.4.3` agregado a `backend/package.json` (dependencies, no devDependencies).
      Docker: no requirió cambios — el lockfile del monorepo (workspaces) ya registra `pagedjs`
      como dependencia de `backend`, y el `Dockerfile` ya instala con
      `npm ci --omit=dev --workspace=backend` desde la raíz, que ya cubre esto.
- [x] 7. Verificación visual real completada con el snapshot real capturado de la propuesta N°13
      (carta id=12): `renderPropuestaMrcPdf()` corrido de punta a punta sin lanzar
      `PF_PDF_FIT_OVERFLOW` — generó un PDF de **3 páginas A4 reales** (confirmado por
      `/MediaBox [0 0 594.96 841.92]` en el PDF, no Letter). Capturas de las 3 páginas revisadas:
      header/footer de marca (foto de fondo + gradientes + logo + slogan) idénticos en las 3,
      contador "Página X de 3" correcto, Declaraciones + Condiciones (la caja que rompía) ahora
      con espacio de sobra en la página 2, nada solapado ni cortado. También se verificó un caso
      normal (no denso): sale en 2 páginas, se ve equivalente al diseño anterior. Pendiente: que
      Kevin revise las capturas/el PDF él mismo antes de mergear — evidencia generada en el
      scratchpad del agente, no en el repo.
- [x] 8. Implementado el ajuste de tamaño de fuente por medición real, no por mapa largo→tamaño.
      `decideV3SectionFontSizes(sections, {measure, budgetPx})` en
      `backend/src/services/propuesta-pdf.service.js`: función PURA (recibe una `measure`
      inyectada, testeable sin navegador) que reduce las 5 secciones variables **en lockstep**
      (un paso a la vez, todas juntas — no agota una antes que las demás) hasta entrar en el
      presupuesto de 2 páginas o hasta que cada una llega a su propio mínimo (mismos valores que
      el sistema viejo). Si ni el mínimo alcanza, no lanza error — el paginado dinámico fluye a
      página 3+ como red de seguridad, sin cambios ahí. `resolveV3SectionFontSizes(page)` mide
      contra Puppeteer real (altura de página vía `getBoundingClientRect()`, no una conversión
      mm→px a mano) y aplica los tamaños finales como estilo inline antes de imprimir.
      Dos ajustes de calibración necesarios además del algoritmo (documentados en el propio
      código): margen inferior de `@page` bajado de 21mm a 15mm (el footer real mide ~13mm, no
      21mm — 8mm desperdiciados por página que se medían mal); colchón de seguridad de 3mm por
      página porque la medición pre-impresión no coincide pixel a pixel con el motor real de
      Paged.js. `npm test`: **427/427 en verde** (5 tests nuevos), confirmado corriendo la suite
      yo mismo. Verificación visual real (releídos ambos PDFs completos): caso liviano (3
      coberturas, descripción de 1 línea) → **2 páginas**, letra levemente más chica pero legible,
      sin cortes ni desperdicio. Caso denso original (propuesta N°13) → sigue en **3 páginas sin
      `PF_PDF_FIT_OVERFLOW`**, header/footer de marca completos y contador de página correcto.

      **[x] Cerrada.** Implementado en `backend/src/services/propuesta-pdf.service.js`:
      `decideV3SectionFontSizes(sections, { measure, budgetPx })` — función pura (measure
      inyectado, testeable sin navegador) que reduce las 5 secciones marcadas
      `[data-fit-section]` (agregado de vuelta a `mrc-v3.js`, no reintroduce el shrink-to-fit
      viejo: solo son ganchos para que el servicio les setee font-size inline) EN LOCKSTEP
      (un paso por vez a cada una, no agota una sección antes que las demás) hasta entrar en
      el presupuesto de 2 páginas o hasta que todas lleguen a su propio mínimo — sin lanzar
      error en ese caso, dejando que Paged.js fluya a página 3+ como red de seguridad.
      `resolveV3SectionFontSizes(page)` orquesta esto contra una `page` de Puppeteer real:
      mide el alto de una página de contenido con un probe de altura conocida en mm
      (`V3_CONTENT_AREA_HEIGHT_MM = 236`, empírico a partir del `@page` real), no una
      conversión mm→px asumida a mano. Se corre en `printV3ProposalPdf()` ANTES de inyectar
      Paged.js (barato: solo cambia font-size y relee un alto, sin re-paginar en cada intento).

      **Dos ajustes de calibración durante la verificación real** (no alcanzaba con solo el
      algoritmo — documentados porque cambian valores del CSS real):
      1. El margen inferior de página (`@page margin`) estaba en `21mm` pero el footer real
         mide ~13mm (medido con `getBoundingClientRect()`) — 8mm desperdiciados por página.
         Bajado a `15mm` (13mm + 2mm de aire, mismo criterio que el header). Libera ~12mm de
         presupuesto de contenido entre las 2 páginas.
      2. Aun así, un caso quedó "justo" (2px por debajo del presupuesto medido en pantalla)
         pero terminó en 3 páginas reales igual: la medición en pantalla
         (`.proposal-body.getBoundingClientRect()`, sin `@page` ni Paged.js activos) y el
         resultado real de Paged.js al paginar para imprimir no coinciden pixel a pixel.
         Agregado `V3_SAFETY_MARGIN_MM = 3` (3mm de colchón por página) al presupuesto antes
         de comparar — deliberadamente generoso frente a la diferencia de 2px observada.

      **Verificado**: `npm test` en `backend/` → 427/427 en verde (5 tests nuevos: la función
      pura con secciones sintéticas — entra a target, reduce en lockstep, respeta mínimos
      propios sin error — más la orquestación real con Puppeteer). Regenerados y releídos
      página por página (herramienta Read, no solo conteo) ambos PDFs finales contra los
      mismos snapshots reales de siempre: el caso liviano (3 coberturas, descripción de 1
      línea, textos legales reales) ahora sale en **2 páginas**, todo legible, sin cortes; el
      caso denso original (propuesta N°13, 11 coberturas + descripción de 5 líneas) sigue en
      **3 páginas sin `PF_PDF_FIT_OVERFLOW`**, header/footer de marca completos en todas,
      contador de página correcto, página 3 solo con Firmas + fila ecológica (el remanente
      real, no espacio desperdiciado).

- [x] 9. **Cambio de enfoque (2026-09-24, confirmado por Kevin):** el paginado libre con
      Paged.js se descarta — parte tarjetas entre páginas (Declaraciones cortada con el borde
      abierto) y deja huecos (media página en blanco cuando una sección salta entera). Kevin:
      "se sigue viendo mal y roto por partes". Nuevo enfoque: volver al diseño de páginas FIJAS
      ya aprobado (HEAD, con su sistema de fit que achica letra hasta el mínimo) y paginar por
      SECCIÓN COMPLETA: se intenta el layout de 2 páginas de siempre; si desborda aun al mínimo,
      se re-renderiza con un layout fijo de 3 páginas que mueve secciones enteras, nunca
      partiendo una tarjeta. Mismo header/footer en todas las páginas ("Página N de 2|3").
      Se saca Paged.js del proyecto. Respaldo del trabajo de paginado dinámico en
      `backup-paginado-dinamico.patch` (scratchpad de la sesión, no en el repo).
      **Hecho:** las tareas 2-8 (Paged.js, running header, escalones de fuente) quedan
      REVERTIDAS — mrc-v3.js, propuesta-pdf.service.js, sus tests, backend/package.json y
      package-lock.json restaurados a HEAD (pagedjs fuera). Sobre esa base: - `buildMrcPropuestaV3Html(snapshot, { layout })`: `'two-page'` (default) genera HTML
      byte-idéntico a HEAD (verificado comparando contra `git show HEAD:` con los dos
      snapshots reales); `'three-page'` reparte secciones enteras en 3 `<article>` fijos,
      header "Página N de 3" y footer en cada uno. Secciones extraídas a constantes (mismo
      markup, sin duplicar). CSS extra solo para 3 páginas, inyectado únicamente en ese layout
      (`data-proposal-layout="three-page"`): la cláusula de cobranzas de P3 no se estira. - Distribución: P1 = asegurado + modalidad + detalle de cobertura + Coberturas principales
      (mismo tema que el detalle; ocupa el espacio que Declaraciones no puede usar en el caso
      denso); P2 = Declaraciones + Condiciones (los dos textos legales largos, holgados, letra
      8px sin achicar); P3 = costo/forma de pago/débito + cobranzas + observaciones + firmas. - `printV3ProposalWithLayoutFallback(page, buildHtml)` en propuesta-pdf.service.js:
      intenta 2 páginas; solo ante `ProposalFitOverflowError` o `ProposalFitError('error')`
      (page-overflow) re-renderiza con 3 páginas; si también desborda, propaga; otros errores
      de fit no reintentan. v1/v2 intactos. - Tests (TDD, rojo → verde): 2 nuevos en mrc-v3.test.js (default byte-idéntico, layout de
      3 páginas con cada sección una vez y en su página, 5 fit-sections), 5 nuevos en
      propuesta-pdf.service.test.js (selección de layout). `npm test` backend: 424/424. - Verificación visual real (PDFs releídos página por página): denso (propuesta N°13,
      antes PF_PDF_FIT_OVERFLOW) → 3 páginas, ninguna tarjeta partida, header pegado arriba,
      footer en las 3; P1 llena, P2 con las cajas legales estiradas (espacio interno abajo,
      igual que el diseño original), P3 termina a ~60% de la hoja (última página). Liviano →
      2 páginas, diseño original intacto.

- [x] 10. (2026-09-24, confirmado por Kevin) Probado: con la descripción del riesgo a 20+
      líneas el layout de 3 páginas también desborda → vuelve el 500. Dos cambios:
      (a) tercer escalón de layout fijo de 4 páginas (2 → 3 → 4), página 1 solo con asegurado +
      modalidad + detalle de cobertura; (b) límite de largo de `descripcion_detallada` (Zod en
      backend + tope y aviso en el formulario), calibrado midiendo el peor caso real (máximo de
      coberturas de un plan MRC) en el layout de 4 páginas, para que la emisión nunca termine en
      500 por texto largo.
      **Hecho:** layout 'four-page' (P1 asegurado+modalidad+detalle; P2 coberturas principales +
      declaraciones; P3 condiciones + costo/pago/débito; P4 cobranzas + observaciones + firmas;
      cajas a su alto natural en P2–P4, sin estirarse). Cadena 2→3→4 en
      `printV3ProposalWithLayoutFallback`. Peor caso: 14 coberturas (plan 7 "COMERCIO PROTECCION
      TOTAL" y máximo real de `cotizacion_coberturas` por cotización en TEST) + dirección larga.
      Medido en 4 páginas: 27 renglones máx. y ~130 caracteres por renglón (3500 caracteres en un
      párrafo corrido). Límite elegido: 1000 caracteres y 15 líneas → el peor texto admisible
      ocupa ~22 renglones (5 de margen). Verificado: tres peores casos en el límite (15 líneas
      "largas+cortas", 14 mínimas + 1 larga, 1000 corridos) emiten sin error. Backend: schema
      Zod (caracteres y líneas, CRLF = 1), readiness marca `descripcion_detallada` pendiente y
      emisión responde 422 con mensaje claro para drafts viejos largos. Frontend: `maxlength`,
      contador vivo de caracteres/líneas, pendiente en paso 5, re-render al cambiar. Layout de
      2 páginas byte-idéntico a HEAD (comprobado con ambos snapshots). Tests: backend 432/432,
      frontend 120/120. PDFs `verif-4p-limite.pdf` (4 págs), `verif-denso.pdf` (3),
      `verif-liviano.pdf` (2) revisados página por página.
- [x] 11. (2026-09-24, pedido por Kevin) En el layout de 4 páginas las P3 y P4 quedaban a media
      hoja. Nuevo layout fijo `'three-page-tall'`: P1 y P2 iguales a 'four-page' (P1 asegurado +
      modalidad + detalle de cobertura; P2 coberturas principales + declaraciones) y P3 = P3+P4
      de 'four-page' (condiciones + costo/pago/débito + cobranzas + observaciones + firmas).
      Cadena de fallback: two-page → three-page → three-page-tall → four-page (four-page queda
      como red de seguridad final). P1/P2 compartidas entre tall y four-page (sin duplicar
      markup); CSS solo bajo `[data-proposal-layout="three-page-tall"]`. Two-page byte-idéntico a
      HEAD (comprobado con ambos snapshots); rama three-page sin tocar. Tests (rojo primero):
      backend 434/434. Verificación visual: los 3 peores casos en el límite (14 coberturas +
      dirección larga; mixto 995 chars/15 líneas, 14 mínimas + una larga 991/15, corrido
      1000/1) salen en 3 páginas; `verif-3p-tall.pdf` leído página por página: ninguna tarjeta
      partida, P3 llena sin desbordar, header pegado arriba. `verif-denso.pdf` sigue en 3
      páginas con el layout 'three-page' aprobado, `verif-liviano.pdf` en 2.

## Modo TDD

No confirmado explícitamente por Kevin en esta sesión. Se trabajó test-primero de todos modos
(se actualizaron/agregaron los tests junto con cada cambio de código, no al final) y se corrió la
suite completa de backend después de cada bloque de cambios — 422/422 tests en verde al cierre,
sin tocar ningún test de v1/v2.

## Estado

Tareas 1 a 7 cerradas con evidencia real (PDF de 3 páginas generado y visualmente revisado,
suite completa en verde). Cambios en el working tree, sin commitear. Pendiente: que Kevin revise
las capturas y decida si esto se sube a TEST para confirmar en vivo, o si quiere ajustes de
layout antes (el resultado no es pixel-perfect respecto al diseño fijo anterior — el contenido
ahora se distribuye según espacio disponible en vez de cortar siempre en el mismo punto entre
página 1 y 2; ver ejemplo del caso "normal" en la verificación de la tarea 7).

### Bug encontrado y corregido antes de mostrarle el resultado a Kevin

Al armar un caso "liviano" para comparar (3 coberturas, descripción de 1 línea, pero con los
textos legales REALES completos, no los cortos de `mrc-v3.test.js`), la página 1 quedaba con
la mitad en blanco: Declaraciones saltaba entera a la página 2 en vez de aprovechar el espacio
libre. Causa real (confirmada, no supuesta): `.card { overflow: hidden }` vuelve a esa caja
"monolítica" para la fragmentación CSS (spec css-break-3) — no se puede partir entre páginas sin
importar el `break-inside` de sus hijos. Fix: `overflow: visible` en `.declarations-box`,
`.conditions-box`, `.principal-coverages-box`, `.collection-clause` (las 4 cajas de texto largo
que sí deben poder partirse). Verificado de nuevo: `npm test` 422/422, ambos PDFs (denso y
liviano) releídos página por página — página 1 ahora se llena con contenido real, sin espacio
desperdiciado.

### Segundo bug encontrado por Kevin y corregido (hueco en blanco sobre el header)

Kevin vio un espacio en blanco entre el borde superior de la página y el banner rojo. Causa
real: `position: running(pfHeader)` estaba declarado DOS VECES — en `.pf-header-block` (el
wrapper correcto, banner + grilla de metadatos) y también en `.proposal-header` (el banner
solo, hijo de ese wrapper). Con el nombre duplicado en dos elementos anidados, el motor de
paginado reservaba el alto del margin-box para el wrapper completo (~46mm) pero terminaba
extrayendo solo el banner (23mm), dejando el resto como hueco. Fix: se sacó `position:
running(pfHeader)` de `.proposal-header` (vuelve a `position: relative`, como era antes de
este cambio, necesario para su overlay `::after`) — el wrapper `.pf-header-block` queda como
única capa "running". `npm test`: 422/422 en verde. PDF regenerado y releído: header pegado
arriba en las 3 páginas, sin hueco.

**Decisión pendiente de Kevin (respondida):** también pidió que el caso liviano vuelva a
entrar en 2 páginas, no solo el denso — ver "Hallazgo real" abajo. Confirmó seguir con el
enfoque híbrido recomendado: tamaño de fuente por escalones según largo real del texto
(deterministic, servidor) + paginado dinámico como red de seguridad solo para contenido
genuinamente extenso. Implementado en la tarea 8.

### Tercer bug encontrado por Kevin y corregido (letra apretada sin necesidad en el caso denso)

Después de cerrar la tarea 8, Kevin probó el PDF denso (propuesta N°13) y dijo: "la densa no
me gusta se rompe demasiado". Causa real: `decideV3SectionFontSizes()` reducía las 5 secciones
en lockstep hasta el mínimo de cada una, pero cuando ni el mínimo lograba entrar en el
presupuesto de 2 páginas, devolvía igual esos tamaños mínimos — resultado: página 2
sobrecargada con 4+ secciones en letra 4.6-4.8px, página 3 casi vacía (solo Firmas). Doble
causa real, no una sola:

1. `decideV3SectionFontSizes` devolvía los tamaños mínimos aunque no lograran el objetivo —
   corregido para devolver los tamaños `target` (cómodos) en ese caso, ya que seguir achicando
   no aporta nada si igual va a desbordar a 3+ páginas.
2. Ese fix solo no alcanzó: la medición pre-impresión (altura en flujo continuo, sin Paged.js
   activo) no modela cómo el motor de paginado real corta páginas — un bloque
   `break-inside: avoid` que no entra completo salta ENTERO a la página siguiente, algo que una
   simple cuenta "alto total / alto de página" no predice. La medición decía "entra en el
   presupuesto" con una reducción parcial que en los hechos seguía dando 3 páginas reales.
   Fix real: `printV3ProposalPdf()` ahora verifica el conteo REAL de páginas después de paginar
   con Paged.js (`document.querySelectorAll('.pagedjs_page').length`); si sigue dando más de 2,
   reimprime desde cero a los tamaños `target` (Paged.js no admite re-paginar un documento ya
   paginado, así que hace falta `page.setContent()` de nuevo antes del segundo intento).
   Costo extra solo en el caso denso: ~1 render adicional (~2.2s totales medidos, aceptable).

`npm test`: 428/428 en verde (2 tests actualizados para el comportamiento correcto + 1 test
nuevo). Verificado con evidencia real: PDF denso regenerado y releído — página 2 ahora solo
tiene "Condiciones" en letra cómoda (8px), página 3 completa con Coberturas principales +
Costo + Forma de pago + Débito + Cobranzas + Observaciones + Firmas, nada apretado ni
desperdiciado. Caso liviano verificado sin cambios (bytes idénticos al PDF de antes de este
fix — confirma que no se disparó el camino de reintento, como corresponde).

### Hallazgo real para comunicarle a Kevin

Con los textos legales reales completos (~5880 caracteres combinados) a un tamaño de fuente
cómodo (8px/7.5px, ya no forzado a 6px), prácticamente **cualquier** Propuesta Formal MRC va a
salir en 3 páginas ahora, no solo los casos densos — antes entraban en 2 solo porque el sistema
de fit los exprimía al mínimo. Esto es la consecuencia esperada de dejar de forzar el contenido,
pero es un cambio de comportamiento real que Kevin debe ver y aprobar (¿está bien que la mayoría
de las Propuestas Formales MRC pasen a ser de 3 páginas en vez de 2?).

### Verificación independiente del orquestador (no solo por quien lo implementó)

- `git diff --stat` revisado: alcance respetado (solo los 4 archivos backend + package.json/lock
  autorizados; el diff en `frontend/propuestas/propuestas.js` es el fix previo de RUC/tipo_firma
  de esta misma sesión, sin relación, no tocado por esta tarea).
- `npm test` corrido de nuevo por mi cuenta en `backend/`: 422/422 en verde.
- `renderPropuestaMrcPdf()` re-corrido de nuevo por mi cuenta contra el snapshot real de la
  propuesta N°13: sin error, 3 páginas, `MediaBox [0 0 594.95996 841.91998]` (A4).
- PDF resultante leído página por página (herramienta Read, no solo conteo de páginas): header
  y footer de marca completos e idénticos en las 3 páginas, contador "Página N de 3" correcto,
  sin texto cortado ni superpuesto, Declaraciones/Condiciones/Coberturas principales con aire de
  sobra.
