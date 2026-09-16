# AGENTS.md — Cotizador Aseguradora Tajy

Este archivo define reglas operativas permanentes para cualquier agente de IA que trabaje en este repositorio, incluidos Codex, OpenCode y Claude Code. No es un historial del proyecto ni reemplaza la documentación principal.

## 1. Fuentes de verdad

Antes de realizar cambios, distinguir claramente entre:

- `AGENTS.md`: reglas permanentes para trabajar en el repositorio.
- `docs/PLAN_DESARROLLO.md`: arquitectura, diseño, schema y reglas de negocio generales.
- `docs/PLAN_PROPUESTA_FORMAL.md`: especificación vigente de Propuesta Formal; prevalece sobre resúmenes históricos de ese módulo.
- `docs/ESTADO_PROYECTO.md`: estado actual, decisiones tomadas, cambios, verificaciones y pendientes.
- Código, migraciones y tests: implementación real existente.

No duplicar aquí checklists temporales, migraciones aplicadas, bugs resueltos, próximos pasos ni historial de cambios.

### Prioridad ante discrepancias

1. No inventar una resolución.
2. Revisar la implementación, migraciones y tests actuales.
3. Consultar la entrada más reciente relacionada en `docs/ESTADO_PROYECTO.md`.
4. Consultar la especificación de Propuesta Formal cuando aplique y `docs/PLAN_DESARROLLO.md` para arquitectura y negocio.
5. Si la contradicción sigue siendo relevante y no puede resolverse con evidencia del repositorio, preguntar antes de un cambio de riesgo.

## 2. Proyecto y stack

Sistema web para que agentes de **Aseguradora Tajy** (Paraguay) coticen pólizas de distintos ramos, generen Carta Oferta y Propuesta Formal con KYC/PLA-FT según el flujo, y mantengan historial con numeración correlativa.

Ramos contemplados: Auto individual y Flota, Incendio, Multirriesgo Hogar, Multirriesgo Comercio, Todo Riesgo Operativo, Transporte de Mercadería, Vida y Accidentes Personales.

| Capa              | Tecnología                                          |
| ----------------- | --------------------------------------------------- |
| Backend           | Node.js + Express                                   |
| Base de datos     | PostgreSQL / Supabase                               |
| Validación        | Zod                                                 |
| Frontend          | Vanilla JavaScript                                  |
| Importación Excel | SheetJS                                             |
| Generación PDF    | Puppeteer (HTML/CSS → PDF)                          |
| Organización      | Monorepo                                            |
| Deploy            | VPS mediante los workflows vigentes del repositorio |

Antes de modificar infraestructura, CI/CD o despliegues, verificar la configuración actual. La documentación histórica no sustituye a los workflows ni al estado real de un entorno.

## 3. Estructura y arquitectura

```text
/backend
  /src/routes
  /src/controllers
  /src/services
  /src/repositories
  /src/calculators
  /src/schemas
  /src/templates
  /migrations

/frontend
  /cotizar
  /historial
  /admin
  /shared

/docs
  PLAN_DESARROLLO.md
  PLAN_PROPUESTA_FORMAL.md
  ESTADO_PROYECTO.md
```

Patrón principal:

```text
routes → controllers → services → repositories → PostgreSQL / Supabase
```

Los calculadores viven en `backend/src/calculators`, las validaciones de entrada en `backend/src/schemas`, las plantillas de documentos en `backend/src/templates` y los cambios de schema en `backend/migrations`.

### Invariantes

- El frontend **nunca** accede directamente a Supabase/PostgreSQL; todo acceso funcional pasa por la API Express.
- Validar con Zod toda entrada externa relevante en el borde de la API, antes de la lógica de negocio.
- Los controllers reciben requests, invocan services, transforman errores y devuelven responses; no contienen lógica de negocio compleja.
- La lógica de negocio pertenece a services o a componentes del dominio, como los calculadores.
- El acceso a datos se encapsula en repositories conforme al patrón existente. No introducir consultas directas desde controllers o frontend.

## 4. Reglas de negocio y fases

No reimplementar fórmulas o comportamiento basándose solo en memoria o supuestos. Antes de modificar tarificación, RPF, descuentos, recargos, franquicias, pagos, planes, coberturas, documentos, correlativos o reglas de un ramo, revisar documentación aplicable, implementación actual, tests y decisiones posteriores.

Cuando la documentación y el código difieran, investigar primero la causa. No "corregir" una decisión solamente porque parezca inusual.

El proyecto se organiza por fases definidas en `docs/PLAN_DESARROLLO.md`; el estado vigente de cada fase se determina desde `docs/ESTADO_PROYECTO.md`.

- No adelantar deliberadamente una fase futura ni reactivar una funcionalidad pausada sin instrucción vigente que lo autorice.
- Evitar mezclar cambios independientes de fases distintas en un mismo commit cuando sea razonablemente posible.
- Si falta un dato de negocio, identificar la dependencia antes de inventar un valor. Esa dependencia no debe bloquear trabajo independiente del mismo alcance.
- Identificar internamente la fase antes de modificar una funcionalidad y mencionarla al usuario cuando afecte la decisión o el alcance.

## 5. Antes de modificar

Primero comprender el área afectada:

1. Leer la petición completa.
2. Consultar el estado de la feature en `docs/ESTADO_PROYECTO.md`.
3. Revisar el plan o especificación correspondiente si intervienen arquitectura o negocio.
4. Localizar la implementación, consumidores y tests.
5. Identificar dependencias y efectos colaterales.
6. Modificar únicamente lo necesario.

No reescribir componentes completos si un cambio localizado, compatible con la arquitectura existente, resuelve la necesidad. Buscar y reutilizar antes de crear o duplicar.

### Política ante dudas

Antes de preguntar por una duda técnica, intentar resolverla con evidencia disponible: código, tests, documentación, historial Git y herramientas de contexto. Preguntar cuando persista una ambigüedad que afecte negocio, datos, seguridad, producción, migraciones, compatibilidad, comportamiento visible o una decisión difícil de revertir.

Para decisiones de bajo riesgo claramente inferibles desde el repositorio, avanzar con evidencia en vez de bloquear innecesariamente el trabajo.

## 6. Migraciones, entornos y despliegues

Todo cambio de schema debe versionarse mediante una migración nueva en `backend/migrations`.

No:

- editar manualmente producción como sustituto de una migración;
- modificar una migración histórica ya aplicada para representar un cambio nuevo;
- asumir que un archivo presente en Git fue aplicado en un entorno;
- asumir que TEST y producción tienen el mismo estado;
- ejecutar cambios destructivos sin comprender el impacto y la recuperación.

Antes de crear una migración, revisar migraciones relacionadas, tablas, funciones, triggers, índices, policies, dependencias del backend, compatibilidad con datos existentes y rollback o recuperación cuando corresponda. Inspeccionar el estado real de Supabase/PostgreSQL cuando haya una herramienta autorizada disponible.

No confundir:

```text
código implementado ≠ commit ≠ push ≠ workflow ejecutado ≠ migración aplicada ≠ deploy completado ≠ feature verificada
```

No afirmar que algo está en producción sin evidencia suficiente. Para cambios sensibles, preferir un flujo verificable y reversible.

## 7. Convenciones de implementación

### Backend

Mantener `routes → controllers → services → repositories`; no crear capas alternativas innecesarias. Cada ramo conserva su lógica aislada en su calculador, salvo una abstracción común deliberada.

### Frontend

Mantener Vanilla JavaScript y las utilidades compartidas. Antes de crear un componente, helper, wrapper de `fetch`, estilo o lógica nueva, buscar un equivalente reutilizable.

### SQL y dependencias

Crear migraciones individuales para cambios nuevos. No modificar el schema de producción como mecanismo normal de desarrollo. No agregar dependencias si la funcionalidad se resuelve razonablemente con las existentes; justificar y evaluar el impacto de cualquier dependencia importante.

## 8. Cambios mínimos y verificación

En tareas localizadas, modificar solo el comportamiento solicitado. No usar una corrección pequeña para introducir refactors amplios no solicitados, especialmente en PDFs, layouts, formularios, cálculos, migraciones, autenticación o permisos.

Antes de alterar código estable, identificar el comportamiento que debe preservarse. Para cambios visuales, preservar contenido y reglas no relacionadas, evitar cambios globales si basta uno localizado y comparar contra la referencia o comportamiento anterior cuando corresponda.

No considerar una tarea terminada solo porque compila o parece correcta. Elegir verificaciones acordes al cambio: tests existentes o nuevos con valor, lint, sintaxis, ejecución local, pruebas de API, migraciones, comparación visual, logs y revisión del diff.

No modificar tests solamente para hacerlos pasar si representan una regla vigente. Si no es posible realizar una verificación importante, indicarlo claramente.

## 9. Documentación, contexto y Git

`docs/ESTADO_PROYECTO.md` es el registro operativo. Registrar allí cambios significativos: decisiones de arquitectura, features completadas, cambios de comportamiento, migraciones creadas o aplicadas, verificaciones, despliegues, diferencias entre TEST/producción, problemas relevantes y pendientes que afecten trabajo posterior.

Modificar este archivo únicamente cuando cambien reglas permanentes de trabajo o arquitectura base. No convertirlo en changelog.

Si está disponible, usar CodeGraph preferentemente para localizar símbolos, referencias, dependencias, flujos e impacto antes de navegar extensamente el repositorio. Usar Engram para recuperar y conservar decisiones o descubrimientos de utilidad futura, sin reemplazar Git ni la documentación del repositorio.

Antes de operaciones Git que puedan descartar trabajo, revisar el estado actual. Mantener commits enfocados; no incluir refactors no relacionados, temporales, artefactos accidentales, cambios ajenos ni secretos. Un push no prueba por sí mismo que los entornos quedaron actualizados.

## 10. Seguridad

Nunca incluir en código, documentación o commits contraseñas, tokens, API keys, claves privadas, service-role keys ni secretos de CI/CD.

No debilitar autenticación, autorización, validaciones o controles de seguridad para facilitar una prueba. Tratar con especial cuidado y verificación los cambios de sesiones, JWT, cookies, CSRF, CORS, permisos, RLS, roles, credenciales o exposición de servicios.

## 11. Principios generales

Todo agente debe:

- comprender antes de modificar;
- buscar antes de crear y reutilizar antes de duplicar;
- preservar comportamiento no solicitado;
- mantener consistencia frontend/backend y reglas de negocio centralizadas;
- basarse en evidencia, no en suposiciones;
- diferenciar claramente TEST de producción, e implementación de despliegue;
- verificar antes de declarar una tarea terminada;
- documentar decisiones relevantes.

Si se detecta documentación obsoleta, contradicción, deuda técnica, vulnerabilidad u oportunidad clara de simplificación, no expandir automáticamente el alcance: informarlo y proponerlo por separado cuando corresponda.
