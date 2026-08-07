# Debt: reducir acoplamiento y fragilidad en cotización (frontend/backend) y modularizar componentes críticos

## Contexto

Se hizo una revisión técnica del repo para detectar puntos frágiles, deuda técnica y módulos acoplados o difíciles de mantener.

El sistema funciona y el backend tiene buena cobertura de tests, pero hay deuda estructural importante en el flujo de cotización y en cómo se reparten las reglas entre frontend, backend y base de datos.

---

## Hallazgos principales

### 1) `frontend/cotizar/cotizar.js` es un punto crítico de fragilidad
- Archivo muy grande (~2300 líneas)
- Mezcla:
  - estado
  - render
  - navegación
  - reglas de negocio de UI
  - armado de payload
  - coordinación con API
- Alto riesgo de regresiones al tocar cualquier flujo del cotizador

### 2) Hay reglas de negocio duplicadas entre frontend y backend
- El frontend contiene lógica derivada del dominio:
  - planes calculables
  - moneda efectiva
  - mapeos por ramo
  - criterios de habilitación de flujos
- Riesgo de desalineación entre UI y cálculo real

### 3) `backend/src/services/cotizacion.service.js` está demasiado cargado
- Mezcla:
  - validación
  - resolución de contexto
  - branching por ramo
  - armado de variantes
  - payload para RPC
  - ownership/permisos
  - lógica de edición
  - PDF
  - conversión monetaria / umbral de inspección
- Alto costo de mantenimiento al agregar/modificar ramos

### 4) Falta cobertura de tests en frontend
- No se detectaron tests equivalentes en `frontend/`
- El área más volátil del sistema depende hoy de testing manual

### 5) Acoplamiento fuerte a RPC/shape de persistencia
- Persistencia depende de payloads JSONB específicos hacia RPCs atómicos
- El dominio queda repartido entre JS y SQL/Postgres

### 6) Hay ramos registrados pero no implementados
- Existen calculadores stub para:
  - auto-flota
  - hogar
  - tro
  - transporte
- Riesgo de confusión, habilitación accidental o surface area innecesaria

### 7) Parte de la lógica depende de nombres/flags/configuración implícita
- `ramo.calculador`
- `plan.tipo_mecanica`
- `plan.nombre`
- campos sembrados por migraciones
- flags de activación
- Esto vuelve más frágil el sistema ante cambios de catálogo/datos

### 8) La documentación compensa complejidad estructural
- Hay varias fuentes relevantes:
  - `README.md`
  - `CLAUDE.md`
  - `docs/PLAN_DESARROLLO.md`
  - `docs/ESTADO_PROYECTO.md`
- Son útiles, pero también muestran que parte del entendimiento del sistema está fuera del código

---

## Evidencia rápida

### Estado de calidad ejecutado
- `npm test --workspace=backend` ✅
- `npm run lint` ✅ (sin errores, con warnings menores)

### Warnings de lint detectados
- `backend/src/utils/cookies.js`
- `backend/src/utils/cookies.test.js`
- `frontend/cotizar/cotizar.js`

---

## Prioridad propuesta

### Alta prioridad
- [ ] Partir `frontend/cotizar/cotizar.js` por responsabilidades
- [ ] Reducir duplicación de reglas entre frontend y backend
- [ ] Dividir `backend/src/services/cotizacion.service.js`
- [ ] Empezar a agregar tests sobre helpers puros del frontend

### Prioridad media
- [ ] Endurecer feature flags / exposición de ramos no implementados
- [ ] Formalizar DTOs/contratos hacia RPCs
- [ ] Reducir lógica dependiente de nombres mágicos o seeds

### Prioridad baja
- [ ] Limpiar warnings de lint
- [ ] Modularizar CSS grande
- [ ] Consolidar documentación operativa

---

## Propuesta de modularización

### Frontend: `frontend/cotizar/cotizar.js`
Extraer en módulos como:

- [ ] `frontend/cotizar/state.js`
- [ ] `frontend/cotizar/constants.js`
- [ ] `frontend/cotizar/domain-rules.js`
- [ ] `frontend/cotizar/body-builder.js`
- [ ] `frontend/cotizar/actions.js`
- [ ] `frontend/cotizar/events.js`
- [ ] `frontend/cotizar/api-client.js`
- [ ] `frontend/cotizar/render/render-shell.js`
- [ ] `frontend/cotizar/render/render-datos.js`
- [ ] `frontend/cotizar/render/render-detalle-plan.js`
- [ ] `frontend/cotizar/render/render-cotizacion-vivo.js`
- [ ] `frontend/cotizar/render/render-resultado.js`

### Backend: `backend/src/services/cotizacion.service.js`
Separar por responsabilidad:

- [ ] `backend/src/services/cotizacion/cotizacion-context.service.js`
- [ ] `backend/src/services/cotizacion/cotizacion-repository-context.service.js`
- [ ] `backend/src/services/cotizacion/cotizacion-persistence.service.js`
- [ ] `backend/src/services/cotizacion/cotizacion-authorization.service.js`
- [ ] `backend/src/services/cotizacion/cotizacion-preview.service.js`
- [ ] `backend/src/services/cotizacion/cotizacion-write.service.js`
- [ ] `backend/src/services/cotizacion/cotizacion-pdf.service.js`
- [ ] `backend/src/services/cotizacion/umbral-inspeccion.service.js`

### Por ramo
- [ ] Evaluar resolver contexto por ramo en archivos separados:
  - `resolver-contexto-auto.js`
  - `resolver-contexto-mrc.js`
  - `resolver-contexto-incendio.js`
  - `resolver-contexto-vidaap.js`

---

## Roadmap sugerido

### Fase 1 — quick wins
- [ ] limpiar warnings de lint
- [ ] revisar exposición de ramos no implementados
- [ ] documentar contrato de payload a RPC
- [ ] extraer helpers puros de `cotizar.js`

### Fase 2 — refactor seguro frontend
- [ ] extraer `constants.js`
- [ ] extraer `domain-rules.js`
- [ ] extraer `body-builder.js`
- [ ] agregar tests sobre esas piezas

### Fase 3 — refactor backend cotización
- [ ] dividir `cotizacion.service.js`
- [ ] mover resolución de contexto a resolvers por ramo

### Fase 4 — alineación de arquitectura
- [ ] hacer que el backend exponga más metadata de ramo/plan
- [ ] reducir la necesidad de lógica duplicada en frontend

---

## Resultado esperado

- Menor acoplamiento entre frontend/backend/BD
- Menos riesgo al tocar cotización
- Mejor escalabilidad para nuevos ramos
- Mayor facilidad para testear y mantener
- Menor dependencia de conocimiento implícito del proyecto
