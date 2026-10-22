# Propuesta Formal — diseño v1 y nueva variante v2

## Goal

Conservar el diseño actual de la Propuesta Formal MRC como v1 y crear una variante v2 con la identidad visual de Carta Oferta (barra Tajy roja, paleta institucional, tablas y tarjetas). Las nuevas emisiones usarán v2 para comparar ambas versiones sobre documentos reales.

## Scope

- `backend/src/templates/propuesta/mrc.js`
- `backend/src/templates/propuesta/mrc-v2.js`
- `backend/src/services/document-snapshot.service.js`
- `backend/src/services/propuesta-pdf.service.js`
- tests de template, snapshot y renderer necesarios

## Non-goals

- No modificar contenido contractual, datos, cálculos, endpoints ni permisos.
- No cambiar Carta Oferta.
- No commit, push ni deploy.

## Plan

1. Identificar explícitamente la revisión v1 y agregar revisión v2 activa para nuevas emisiones.
2. Implementar el estilo v2 reutilizando el markup y comportamiento de ajuste/overflow existente.
3. Seleccionar renderer por revisión del snapshot, preservando PDFs históricos v1.
4. Agregar regresiones y ejecutar tests focalizados, lint/format y verificación de PDF.
5. Registrar evidencia y pendientes de comparación visual.

## Status

- [x] Implementación
- [x] Verificación
- [ ] Comparación visual

## Evidence

- Final focused verification passed: 42 tests, 0 failures.
- Syntax checks passed.
- Full `git diff --check` passed with no output.
- Puppeteer smoke passed: v2 Legal, 2 pages, 179,339 bytes at `C:/tmp/propuesta-formal-v2-preview.pdf`.
- Puppeteer smoke passed: v1 A4, 2 pages, 204,249 bytes at `C:/tmp/propuesta-formal-v1-preview.pdf`.
- Added a deterministic v2 readiness gate: `waitForProposalV2Ready` waits for the embedded fit/font script to leave `data-proposal-fit="pending"` before `printV2ProposalPdf` prints Legal output.
- The v2 readiness gate intentionally does not validate v1 metrics or reject overflow; v2 readiness gates the embedded fit/font script, while visual comparison remains the risk and is still pending.
- Visual comparison remains pending because no human/pixel inspection was performed.
