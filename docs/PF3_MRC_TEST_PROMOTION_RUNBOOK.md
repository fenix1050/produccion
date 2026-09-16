# Runbook local de promoción TEST — corrección de Declaraciones PF-3 MRC

**Estado:** preparación local, default-deny. **No es una autorización de ejecución.**

> Este documento no contiene endpoints, credenciales, SQL, comandos ni instrucciones operativas remotas. Cada valor y cada acción remota debe ser aprobado expresamente por una persona autorizada antes de continuar.

## 1. Decisión y objetivo

Preparar una promoción controlada a **TEST** para corregir los dos textos de Declaraciones de PF-3 MRC mediante dos nuevas versiones append-only de `propuesta_textos`, publicadas exclusivamente por el RPC auditado existente `publicar_texto_propuesta`:

| Clave                                   | Producto | Resultado esperado en TEST                                       |
| --------------------------------------- | -------- | ---------------------------------------------------------------- |
| `declaracion_jurada_origen_fondos`      | `mrc`    | Nueva versión publicada con el texto aprobado y hash registrado. |
| `autorizaciones_tomador_poliza_digital` | `mrc`    | Nueva versión publicada con el texto aprobado y hash registrado. |

La fuente guía aprobada es `docs/insumos/Propuesta formal mrc.pdf`, SHA-256 `aa7baa45786d8104d23999f20c9ef957576cc333900278e2ea8903d204660433`.

La aprobación actual del fixture/PDF local **no cambia una emisión real**: no publica textos en TEST, no crea una Propuesta Formal, no genera ni carga un PDF remoto, ni produce un snapshot inmutable o un recibo de auditoría de emisión.

## 2. No objetivos estrictos

- No ejecutar esta promoción desde este documento ni acceder a TEST, producción, secretos, credenciales o sistemas remotos.
- No modificar código de aplicación, migraciones, datos de esquema, políticas ni permisos.
- No crear scripts de despliegue, kits de despliegue ni automatización remota.
- No emitir, anular, reemplazar ni eliminar Propuestas Formales fuera de la emisión sintética aprobada en TEST.
- No alterar ni borrar versiones históricas de texto, snapshots, PDFs privados, eventos de auditoría o correlativos.
- No hacer merge ni push. No existe un kit/workflow aislado conocido para desplegar TEST y un push a `main` despliega producción; por lo tanto, no se permite merge/push como parte de esta promoción.

## 3. Principio de inmutabilidad

Una emisión guarda un `snapshot_json`, `snapshot_hash`, `text_versions_json`, hash de PDF y demás metadatos de su momento de emisión. Esos snapshots históricos son evidencia inmutable: publicar una nueva versión de texto sólo determina la versión disponible para **emisiones futuras**; no reescribe el documento, PDF, hash ni `text_versions_json` de una emisión previa.

La corrección se resuelve hacia adelante mediante nuevas versiones append-only. Al publicar, el RPC crea una nueva versión y marca la versión previamente publicada con `publicado = FALSE`; su contenido, número de versión y auditoría permanecen preservados. No se corrige historia editando o borrando registros existentes. Volver a un texto previo es una publicación hacia adelante de otra versión con el texto aprobado, nunca la eliminación, edición o reactivación de contenido histórico.

## 4. Aprobaciones y valores obligatorios antes de cualquier acción

Ningún campo vacío implica autorización. Una persona autorizada debe entregar y aprobar por escrito los siguientes valores exactos:

| Ítem                     | Valor exacto a suministrar                                                                                                                                   | Aprobación requerida                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Identidad de TEST        | Nombre/identificador inequívoco del entorno TEST.                                                                                                            | Aprobación explícita de la persona autorizada, con su identidad y referencia registradas. |
| Destinos TEST            | Endpoints, identificador de proyecto y bucket privado de TEST.                                                                                               | Aprobación explícita de la persona autorizada, con su identidad y referencia registradas. |
| Actor                    | Identificador exacto del actor autorizado y confirmación de su rol/permiso.                                                                                  | Aprobación explícita de la persona autorizada, con su identidad y referencia registradas. |
| Motivo auditado          | Texto exacto del motivo que quedará registrado por cada nueva versión.                                                                                       | Aprobación explícita de la persona autorizada, con su identidad y referencia registradas. |
| Carta/borrador sintético | Identificadores exactos de una Carta Oferta y su borrador elegibles, exclusivamente sintéticos.                                                              | Aprobación explícita de la persona autorizada, con su identidad y referencia registradas. |
| Textos                   | Contenido literal aprobado de ambas claves, sin normalización no aprobada.                                                                                   | Aprobación explícita de la persona autorizada, con su identidad y referencia registradas. |
| Hashes de textos         | SHA-256 exacto de la forma canónica persistida de cada una de las dos claves: el contenido aprobado tras `trim`, porque el schema/RPC recortan el contenido. | Aprobación explícita de la persona autorizada, con su identidad y referencia registradas. |
| Retención                | Política, responsable y plazo de retención para recibos, snapshots y PDF de TEST.                                                                            | Aprobación explícita de la persona autorizada, con su identidad y referencia registradas. |
| Candidato                | Identidad exacta de imagen/artefacto y SHA inmutable aprobados para TEST.                                                                                    | Aprobación explícita de la persona autorizada, con su identidad y referencia registradas. |
| Evidencia del runbook    | Hash o identidad inmutable de esta revisión del runbook aprobada para ejecución.                                                                             | Aprobación explícita de la persona autorizada, con su identidad y referencia registradas. |

La persona ejecutora no infiere ninguno de estos valores de este repositorio, de una sesión local ni de un entorno distinto. Para la aprobación y la verificación posterior a la publicación, la fuente de verdad del hash es exclusivamente la forma canónica persistida y recortada (`trim`), no una variante local con espacios externos.

## 5. Gates de preflight (todos en verde)

| Gate                | Evidencia mínima                                                                                                                                                                        | Estado al preparar este runbook                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Entorno correcto    | La identidad, endpoints, proyecto y bucket recibidos coinciden con TEST aprobado.                                                                                                       | Pendiente de valores humanos.                       |
| Migraciones 069–072 | Estado exacto y verificable de 069, 070, 071 y 072 en el TEST identificado. Cualquier ausencia, diferencia o duda bloquea.                                                              | No verificado por este runbook.                     |
| Default-deny de RPC | Evidencia de que `anon` y `authenticated` no tienen `EXECUTE` sobre los RPC de PF-3, y que sólo `service_role` mantiene el acceso requerido.                                            | Debe verificarse en TEST.                           |
| Artefacto candidato | Imagen/artefacto y SHA exactos aprobados; no se acepta una rama, `main` mutable ni un artefacto sin identidad inmutable.                                                                | Pendiente de aprobación humana.                     |
| Fuente y textos     | Hash de la guía igual a `aa7baa45786d8104d23999f20c9ef957576cc333900278e2ea8903d204660433`; hashes de ambas formas canónicas persistidas y recortadas (`trim`) iguales a los aprobados. | Guía registrada localmente; textos TEST pendientes. |
| Datos sintéticos    | Carta y borrador elegibles, sintéticos, identificados y aprobados; sin datos reales.                                                                                                    | Pendiente de aprobación humana.                     |
| Retención y recibo  | Política de retención aprobada y ubicación de custodia del recibo identificada.                                                                                                         | Pendiente de aprobación humana.                     |

**Regla de bloqueo:** si un gate no tiene evidencia verificable, se detiene. No se sustituye con una suposición, una aprobación implícita ni evidencia de QA, local o producción.

## 6. Secuencia propuesta y controlada para TEST

La secuencia siguiente describe controles, no comandos. Cada línea requiere una **aprobación separada, explícita y registrada inmediatamente antes de la acción remota indicada**. La negativa, expiración, ambigüedad o cambio de alcance detiene el proceso.

| Paso | Acción remota propuesta                                                                                    | Aprobación separada previa                                                                  | Evidencia a registrar antes de pasar                                                                                                              |
| ---- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Confirmar identidad y límites del entorno TEST.                                                            | Aprobar sólo la verificación remota de identidad.                                           | Entorno, proyecto, endpoints y bucket confirmados.                                                                                                |
| 2    | Verificar estado de migraciones 069–072 y default-deny de RPC.                                             | Aprobar sólo la lectura/verificación remota de configuración.                               | Estado individual 069–072; denegación de `anon`/`authenticated`; acceso exclusivo `service_role`.                                                 |
| 3    | Confirmar que el candidato aprobado tiene la identidad de imagen/artefacto y SHA aprobados.                | Aprobar sólo la verificación remota del candidato.                                          | Identidad y SHA; hash de esta revisión del runbook.                                                                                               |
| 4    | Publicar una nueva versión de `declaracion_jurada_origen_fondos` mediante `publicar_texto_propuesta`.      | Aprobar sólo esta publicación, con actor, motivo, texto y hash canónico persistido exactos. | Nueva versión devuelta; versión antes publicada con `publicado = FALSE`; actor, motivo auditado, hash canónico persistido y auditoría preservada. |
| 5    | Publicar una nueva versión de `autorizaciones_tomador_poliza_digital` mediante `publicar_texto_propuesta`. | Aprobar sólo esta publicación, con actor, motivo, texto y hash canónico persistido exactos. | Nueva versión devuelta; versión antes publicada con `publicado = FALSE`; actor, motivo auditado, hash canónico persistido y auditoría preservada. |
| 6    | Ejecutar una única emisión sintética aprobada usando la Carta/borrador elegibles.                          | Aprobar sólo esta emisión sintética.                                                        | Identificadores, correlativo, snapshot y `text_versions_json`.                                                                                    |
| 7    | Obtener y verificar el PDF privado emitido de la propuesta sintética.                                      | Aprobar sólo la verificación/obtención del PDF de TEST.                                     | Hash PDF, tamaño, ubicación privada conforme a la política de retención y revisión contra el candidato aprobado.                                  |
| 8    | Ejecutar una prueba negativa controlada de emisión duplicada sobre la misma Carta.                         | Aprobar sólo la prueba negativa.                                                            | Bloqueo observado antes de generar/subir un segundo PDF; sin segunda emisión.                                                                     |
| 9    | Custodiar el recibo de ejecución según la retención aprobada.                                              | Aprobar sólo el resguardo del recibo.                                                       | Ubicación, responsable, plazo y referencia del recibo.                                                                                            |

No se avanza de un paso a otro por la mera aprobación general de la promoción. Ninguna acción de despliegue, merge o push forma parte de esta secuencia.

## 7. Criterios de aceptación de TEST

La promoción queda aceptada sólo si se registra evidencia de todo lo siguiente:

- [ ] Las dos nuevas versiones append-only corresponden exactamente a las claves y a los hashes aprobados de sus formas canónicas persistidas y recortadas (`trim`).
- [ ] Cada publicación dejó la versión antes publicada con `publicado = FALSE` y preservó su contenido, número de versión y auditoría.
- [ ] La guía fuente conserva el SHA-256 `aa7baa45786d8104d23999f20c9ef957576cc333900278e2ea8903d204660433`.
- [ ] El PDF candidato aprobado se identifica de forma inmutable y el PDF emitido sintético fue revisado contra esa aprobación; esa revisión no se confunde con aprobación de un fixture local.
- [ ] La emisión sintética contiene `snapshot_json` y `snapshot_hash` no vacíos y coherentes con la emisión.
- [ ] `text_versions_json` de la emisión referencia las nuevas versiones publicadas de ambas claves.
- [ ] El PDF emitido tiene hash registrado y queda en el bucket privado aprobado, con retención aplicada.
- [ ] La prueba negativa bloquea la emisión duplicada de la misma Carta antes de generar o cargar un segundo PDF.
- [ ] No se modificó ningún snapshot histórico, versión histórica, PDF histórico, evento de auditoría ni migración.
- [ ] El recibo está completo, con aprobaciones por paso y sin secretos, credenciales ni datos personales innecesarios.

## 8. Rollback y corrección hacia adelante

No hay rollback destructivo. Está prohibido borrar snapshots, PDFs, eventos, correlativos o versiones de `propuesta_textos`, y está prohibido revertir migraciones 069–072.

Si una versión recién publicada es incorrecta, se detiene la emisión y se gestiona una **nueva** versión append-only, con nuevo texto, hash canónico persistido tras `trim`, motivo auditado y aprobación explícita. Esa publicación hacia adelante deja en `publicado = FALSE` la versión que estaba publicada y preserva el contenido, número de versión y auditoría de todas las versiones históricas; nunca se borran, editan ni reactivan. Si ya existe una emisión, su snapshot y PDF permanecen inmutables; cualquier corrección documental posterior requiere el flujo de anulación/reemplazo que sea aprobado separadamente, no edición directa.

## 9. Condiciones de detención

Detener inmediatamente y no ejecutar más acciones remotas si ocurre cualquiera de estas condiciones:

- Falta, cambia o no puede verificarse una aprobación o valor obligatorio.
- El destino no prueba ser el TEST aprobado, o se detecta producción o un entorno ambiguo.
- Alguna migración entre 069 y 072 está ausente, distinta o no verificable.
- `anon` o `authenticated` conserva permiso de ejecución, o no se puede demostrar el acceso exclusivo requerido de `service_role`.
- El candidato, su SHA, la guía fuente, los hashes de texto o el runbook no coinciden con lo aprobado.
- La Carta/borrador no es sintético, no es elegible o no está aprobado.
- La publicación no devuelve la nueva versión esperada, no deja en `publicado = FALSE` la versión antes publicada, su auditoría no es comprobable o existe una discrepancia de contenido/hash canónico persistido tras `trim`.
- La emisión no preserva snapshot, `text_versions_json` o hash de PDF, o la prueba negativa no bloquea el duplicado antes del PDF.
- Se solicita merge, push, despliegue a través de `main`, acceso a secretos, una migración, SQL, comandos no aprobados o cualquier acción fuera de este runbook.

La respuesta al stop es conservar la evidencia, registrar el motivo en el recibo y solicitar una nueva decisión humana. No se improvisa una recuperación técnica.

## 10. Plantilla de recibo de ejecución

> Completar sólo durante una ejecución humana autorizada. No incluir secretos, credenciales ni contenido personal no necesario.

| Campo                                                                                                                             | Registro                                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Identificador del recibo                                                                                                          |                                                                    |
| Fecha/hora y zona horaria                                                                                                         |                                                                    |
| Ejecutor autorizado                                                                                                               |                                                                    |
| Aprobadores y referencias                                                                                                         |                                                                    |
| Identidad de TEST                                                                                                                 |                                                                    |
| Endpoints/proyecto/bucket aprobados                                                                                               |                                                                    |
| Identidad y SHA del candidato                                                                                                     |                                                                    |
| Identidad/hash de esta revisión del runbook                                                                                       |                                                                    |
| SHA de la guía fuente                                                                                                             | `aa7baa45786d8104d23999f20c9ef957576cc333900278e2ea8903d204660433` |
| Estado individual de migraciones 069/070/071/072                                                                                  |                                                                    |
| Evidencia default-deny y `service_role`                                                                                           |                                                                    |
| Carta/borrador sintéticos aprobados                                                                                               |                                                                    |
| Actor y motivo auditado                                                                                                           |                                                                    |
| Hash canónico persistido tras `trim`, versión nueva y versión previa `publicado = FALSE`: `declaracion_jurada_origen_fondos`      |                                                                    |
| Hash canónico persistido tras `trim`, versión nueva y versión previa `publicado = FALSE`: `autorizaciones_tomador_poliza_digital` |                                                                    |
| Aprobación por cada paso 1–9                                                                                                      |                                                                    |
| Identificador de emisión sintética                                                                                                |                                                                    |
| `snapshot_hash` y referencia a `snapshot_json`                                                                                    |                                                                    |
| `text_versions_json` verificado                                                                                                   |                                                                    |
| Hash/tamaño/ubicación privada del PDF                                                                                             |                                                                    |
| Resultado del bloqueo de emisión duplicada                                                                                        |                                                                    |
| Política, ubicación y plazo de retención                                                                                          |                                                                    |
| Stops, excepciones o desviaciones                                                                                                 |                                                                    |
| Decisión final: aceptado / no aceptado                                                                                            |                                                                    |
| Responsable del cierre                                                                                                            |                                                                    |
