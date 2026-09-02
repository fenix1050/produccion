# Plan integral — Propuesta Formal y preparación de Maquinarias

Este documento define cómo incorporar la **Propuesta Formal** al Cotizador Tajy y consolida las
decisiones posteriores sobre la familia **Maquinarias**. Es un plan de arquitectura y producto: no
implica que las tablas, endpoints, pantallas o plantillas aquí propuestas ya existan.

> **Estado del documento (2026-08-27):** planificación consolidada. PF-1 — Carta Oferta histórica
> — está implementada y verificada en QA para MRC. PF-2 está implementado localmente solo para MRC
> mediante la migración 069, API modular y UI `/propuestas/`, pero todavía no fue aplicado ni
> verificado en QA. PF-3 y los tramos posteriores siguen sin implementación. Las decisiones marcadas como **Aprobada**
> son obligatorias; las marcadas como **Recomendación** describen el diseño propuesto; las marcadas
> como **Pendiente** requieren confirmación antes de implementar el tramo afectado.

## 1. Resumen ejecutivo

La Propuesta Formal debe ser un único módulo con dos entradas:

1. desde una Carta Oferta apta, mediante el CTA **“Preparar Propuesta Formal”**;
2. desde Bienvenida, buscando una Carta Oferta apta ya persistida.

En ambos casos el flujo parte de la misma entidad de Carta Oferta y termina con el CTA **“Emitir
Propuesta Formal”**. No se debe cargar una propuesta desde cero, interpretar un PDF ni volver a
calcular importes. La fuente es una cotización estructurada, persistida y versionada, con una Carta
Oferta reproducible y una selección explícita de variante y plan de pago ya calculados.

PF-1 ya convierte Carta Oferta en un documento histórico: snapshot inmutable, versión de datos,
versión de plantilla, hash y archivo PDF privado. Los borradores de Propuesta Formal se persisten
desde la primera versión recién en PF-2. Una modificación comercial —capital, cobertura, franquicia,
tasa, descuento, recargo, vigencia económica, variante o plan de pago— obliga a recotizar y emitir
una nueva Carta Oferta.

La primera implementación recomendada es **MRC**. **Hogar** debe quedar preparado mediante un
adapter propio, pero no debe habilitarse hasta que su cotizador y su Carta Oferta estructurada estén
disponibles. **Maquinarias** se modela como una familia de navegación con dos productos independientes:
Sección Automóvil y Sección Incendio. Comparten utilidades y un schema base de maquinaria, pero cada
sección mantiene su cotización, calculator, schema, Carta Oferta y Propuesta Formal.

## 2. Estado actual

### 2.1 Confirmado en el repositorio

| Área                       | Estado actual verificado                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API de Propuesta           | Solo existen `POST /api/cotizaciones/:id/aceptar` y `GET /api/cotizaciones/:id/pdf-propuesta`.                                                                                                                |
| Services                   | `aceptarCotizacion()` y `generarPdfPropuestaFormal()` lanzan errores explícitos de “Fase 4 pendiente”.                                                                                                        |
| Autorización de esos stubs | Los controllers no pasan `req.usuario`; debe corregirse al implementar para aplicar ownership y permisos.                                                                                                     |
| Bienvenida                 | “Elaborar una Propuesta Formal” abre un placeholder “Próximamente”.                                                                                                                                           |
| KYC                        | `cliente_kyc`, creada por la migración 007, guarda un único bloque básico ligado 1:1 a `cotizaciones`.                                                                                                        |
| Resultado comercial        | Se persisten variantes y planes de pago calculados; no se persiste cuál aceptó el cliente.                                                                                                                    |
| Carta Oferta               | PF-1 persiste `cartas_oferta` versionada con snapshot canónico, hash, versiones de schema/plantilla/calculator, estados y PDF privado. La respuesta HTTP entrega el PDF emitido o el PDF privado reutilizado. |
| Builders de Carta          | Existen builders para MRC e Incendio. Vida/AP no tiene builder por falta de texto oficial.                                                                                                                    |
| PDF                        | Puppeteer genera la Carta en formato Legal/Oficio desde el snapshot persistido; PF-1 almacena el artefacto privado y su hash.                                                                                 |
| Moneda                     | Las cotizaciones soportan moneda y snapshot de tipo de cambio, pero `plan-pago.js` redondea siempre al millar.                                                                                                |

### 2.2 Insuficiencias del modelo vigente

`cliente_kyc` no alcanza para reproducir una Propuesta Formal completa porque no representa de forma
estructurada:

- tomador distinto del asegurado;
- representante legal de una persona jurídica;
- uno o varios beneficiarios finales;
- origen de fondos con concepto, actividad, moneda, importe y respaldo;
- PEP propio, por vinculación y con los datos completos requeridos por producto;
- selección aceptada de variante y forma de pago;
- versiones, snapshots, auditoría, hash ni estado del documento.

### 2.3 Fuentes documentales disponibles

- `docs/insumos/2026_05_21 GRUPO SEGURIDAD ELECTRONICA PARAGUAY E.A.S - MULT. COMERCIO.pdf`
  es una **cotización/Carta Oferta** de MRC, no una Propuesta Formal.
- No se identificó en `docs/insumos/` un PDF de Propuesta Formal de Hogar claramente rotulado como tal.
- Sin embargo, durante la planificación el usuario aportó mediante texto e imágenes los modelos
  oficiales completos de Propuesta Formal MRC y Hogar; son fuente funcional aunque todavía no estén
  archivados en el repositorio.
- `docs/insumos/Cotizacion maquinarias.xlsx` existe, pero contiene fórmulas, referencias y totales
  legacy. No es una especificación ejecutable.
- Para Maquinarias prevalecen la instrucción del **24/08/2026**, las tasas aprobadas y las decisiones
  registradas en este documento.

## 3. Flujo de datos actual

El flujo vigente de Carta Oferta incluye el fundamento documental de PF-1:

```text
Frontend /cotizar
    |
    | POST /api/cotizaciones/calcular
    v
calculator por ramo ---> variantes + planes de pago (preview)
    |
    | POST /api/cotizaciones
    v
RPC atómico de persistencia
    |
    +--> cotizaciones
    +--> cotizacion_coberturas (snapshot parcial de catálogo)
    +--> cotizacion_variantes
    +--> cotizacion_plan_pago (todas las alternativas)
    +--> cotizacion_ajustes
    |
    | GET /api/cotizaciones/:id/pdf-oferta
    v
snapshot canónico + verificación de frescura + versión en cartas_oferta
    |
    +--> snapshot_json inmutable + hash + estado + PDF privado
    |
    v
Puppeteer renderiza el snapshot_json persistido ---> respuesta HTTP
```

El tramo de Propuesta Formal no continúa este flujo: sus endpoints llegan a stubs. PF-1 ya captura
las dependencias de render activas y renderiza exclusivamente el `snapshot_json` persistido, por lo
que no necesita lecturas mutables de catálogo o perfil para reproducir la Carta.

### Flujo objetivo

```text
Cotización persistida + resultado comercial persistido
    |
    | emitir Carta Oferta
    v
Snapshot inmutable de Carta + versión + hash + PDF privado
    |
    | validar vigencia, ownership, estado y aptitud del producto
    v
Borrador persistente de Propuesta Formal
    |
    +--> referencia a Carta
    +--> referencia a variante y plan de pago persistidos
    +--> partes (tomador/asegurado/representante/beneficiarios)
    +--> KYC/PLA-FT común + adapter de producto
    +--> auditoría de cambios
    |
    | “Emitir Propuesta Formal”
    v
Snapshot inmutable de Propuesta + hash + PDF privado + estado emitida
```

## 4. Análisis comparativo de PDFs MRC vs Hogar

### 4.1 Evidencia disponible

Durante esta planificación el usuario aportó, mediante texto e imágenes, **dos modelos oficiales
completos**: una Propuesta Formal de MRC y una Propuesta Formal de Hogar. Esos modelos son evidencia
real del diseño funcional aunque no estén almacenados como archivos dentro de `docs/insumos/`.

El repositorio sí contiene una Carta Oferta MRC, pero no contiene copias versionadas de esas dos
Propuestas Formales. Esta diferencia de soporte no reduce los modelos aportados a una hipótesis: sus
campos y bloques se consideran insumos oficiales de planificación. Antes de implementar, deben
archivarse o transcribirse de forma controlada para permitir trazabilidad campo por campo.

### 4.2 Núcleo común observado

Ambos modelos comparten una estructura suficientemente estable para justificar un solo módulo:

- identificación de la propuesta, asegurado y tomador;
- datos personales, domicilios, contacto y actividad económica;
- declaraciones PEP y PLA-FT, origen de fondos y sujeto obligado;
- identificación y descripción del riesgo;
- coberturas, sumas aseguradas, franquicias y textos contractuales;
- prima, impuestos, forma de pago, cuotas y autorizaciones asociadas;
- instrucciones de entrega, declaraciones finales y firmas;
- trazabilidad del agente/operador y fecha de emisión.

### 4.3 Diferencias reales por producto

| Bloque               | Propuesta Formal MRC                                                                                                    | Propuesta Formal Hogar                                                                      | Consecuencia de diseño                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Modalidad/producto   | Incluye la **modalidad 1020** y la identificación de la cobertura comercial.                                            | Identifica el plan/producto de Hogar y los datos propios de la vivienda.                    | Campo/adaptador de producto; no texto libre compartido.                                          |
| Riesgo               | Descripción narrativa del riesgo comercial, actividad, ubicación y características operativas.                          | Identificación inmobiliaria: finca, lote, padrón y cuenta catastral.                        | El núcleo conserva `riesgo_snapshot`; cada adapter define su schema visible.                     |
| Construcción/entorno | Condiciones del local y ubicación que inciden en cobertura y franquicia.                                                | Materiales y estructura, cantidad de pisos, ocupación, linderos y cerramiento.              | Bloques específicos, heredados de la Carta cuando existan y manuales cuando el modelo los exija. |
| Bienes/coberturas    | Artículos asegurados con suma y prima; cristales; CCTV; franquicias por cobertura y ubicación.                          | Edificio/contenido, electrónicos, robo a la intemperie, asistencias e inhabitabilidad.      | Líneas estructuradas y textos contractuales versionados por producto.                            |
| Antecedentes         | Datos comerciales y condiciones particulares del riesgo.                                                                | Siniestralidad previa declarada.                                                            | Sección condicional propia de Hogar.                                                             |
| Derechos             | Condiciones y beneficiarios relacionados con el riesgo comercial cuando corresponda.                                    | Transferencia de derechos vinculada al inmueble/acreedor cuando corresponda.                | Relación contractual específica, no campo genérico ambiguo.                                      |
| PEP                  | Declara si la persona desempeña o desempeñó **cargo público nacional o extranjero**, con detalle del cargo/institución. | Declara condición **PEP o persona vinculada a PEP** y contempla el período de **dos años**. | Núcleo común de declaraciones; reglas, relación y ventana temporal en cada adapter.              |
| Pago                 | Selección de alternativa persistida, detalle de prima y autorización condicional.                                       | Mismo núcleo, con textos/autorizaciones del modelo Hogar.                                   | Referencias a variante/pago; nunca recalcular en Propuesta.                                      |
| Entrega y firmas     | Entrega, declaraciones y firmas de las partes aplicables al riesgo comercial.                                           | Entrega, declaraciones y firmas aplicables al tomador/asegurado del hogar.                  | Componente común con firmantes y textos condicionados por producto/forma de pago.                |

### 4.4 Conclusión de reutilización

MRC y Hogar no justifican dos módulos independientes. Comparten identidad, partes, contacto,
domicilios, selección comercial, pago, declaraciones, auditoría y emisión. Las diferencias deben
encapsularse en:

- schema de datos de riesgo del producto;
- reglas de obligatoriedad y PEP;
- secciones legales y orden del PDF;
- firmantes o anexos particulares.

## 5. Matriz de campos

La matriz preserva el contrato funcional aprobado. **Fuente** indica de dónde se obtiene el dato;
**comportamiento** define si puede editarse en Propuesta. Los campos agrupados como textos
contractuales deben conservar el texto exacto y su versión, aunque se representen aquí en una fila.

| Campo/concepto                                       | Sección             | Producto    | Categoría   | Fuente                               | Comportamiento                    | Obligatorio/condición                       | Observaciones                                                                      |
| ---------------------------------------------------- | ------------------- | ----------- | ----------- | ------------------------------------ | --------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Carta Oferta de origen                               | Origen              | Común       | SISTEMA     | Base de datos                        | HEREDADO_READONLY                 | Siempre                                     | Debe estar emitida, versionada y apta.                                             |
| Número/versión de Carta                              | Origen              | Común       | SISTEMA     | `cartas_oferta`                      | HEREDADO_READONLY                 | Siempre                                     | Identifica el linaje comercial aceptado.                                           |
| Variante aceptada                                    | Selección comercial | Común       | HEREDADO    | Resultado persistido                 | HEREDADO_READONLY                 | Siempre                                     | FK; no aceptar importes enviados como sustituto.                                   |
| Plan de pago aceptado                                | Selección comercial | Común       | HEREDADO    | `cotizacion_plan_pago`               | HEREDADO_READONLY                 | Siempre                                     | Debe pertenecer a la variante elegida.                                             |
| Número y versión de Propuesta                        | Identificación      | Común       | SISTEMA     | Backend/DB                           | CALCULADO_READONLY                | Al emitir                                   | Correlativo y versión independientes de la Carta.                                  |
| Tipo de persona                                      | Asegurado           | Común       | HEREDADO    | Cotización/cliente                   | HEREDADO_EDITABLE_CON_ADVERTENCIA | Siempre                                     | Cambiarlo reevalúa campos condicionales y compliance.                              |
| Nombre y apellido/razón social                       | Asegurado           | Común       | HEREDADO    | Cotización/cliente                   | HEREDADO_EDITABLE_CON_ADVERTENCIA | Siempre                                     | El cambio queda auditado; no cambia el riesgo comercial.                           |
| Cédula/documento/RUC                                 | Asegurado           | Común       | MANUAL      | Usuario/modelo oficial               | MANUAL                            | Siempre según tipo de persona               | Validar formato y país; “Por confirmar” para documentos extranjeros admitidos.     |
| Fecha de nacimiento/constitución                     | Asegurado           | Común       | MANUAL      | Usuario/modelo oficial               | MANUAL                            | Según tipo de persona                       | No inferir desde el documento.                                                     |
| Nacionalidad/país de constitución                    | Asegurado           | Común       | MANUAL      | Usuario/modelo oficial               | MANUAL                            | Según tipo de persona                       | Catálogo controlado.                                                               |
| Estado civil                                         | Asegurado           | Común       | MANUAL      | Usuario/modelo oficial               | CONDICIONAL                       | Persona física, si lo exige el modelo       | Regla final por confirmar con Compliance.                                          |
| Profesión, ocupación o actividad económica           | Asegurado           | Común       | MANUAL      | Usuario/modelo oficial               | MANUAL                            | Siempre                                     | Separar actividad de descripción libre.                                            |
| Domicilio particular/legal/comercial                 | Asegurado           | Común       | MANUAL      | Usuario/modelo oficial               | MANUAL                            | Según persona/producto                      | Guardar tipo, dirección, ciudad y país.                                            |
| Teléfono y correo electrónico                        | Asegurado           | Común       | HEREDADO    | Cotización/cliente                   | HEREDADO_EDITABLE                 | Siempre                                     | Conservar snapshot de lo declarado al emitir.                                      |
| Tomador igual al asegurado                           | Tomador             | Común       | MANUAL      | Usuario                              | MANUAL                            | Siempre                                     | Controla si se reutiliza la misma parte.                                           |
| Datos completos del tomador                          | Tomador             | Común       | MANUAL      | Usuario/modelo oficial               | CONDICIONAL                       | Si difiere del asegurado                    | Mismos datos de identidad/contacto requeridos al asegurado.                        |
| Representante legal                                  | Partes              | Común       | MANUAL      | Usuario/modelo oficial               | CONDICIONAL                       | Persona jurídica o representación aplicable | Nombre, documento, cargo y facultad; vigencia por confirmar.                       |
| Beneficiarios finales                                | Partes              | Común       | MANUAL      | Usuario/Compliance                   | CONDICIONAL                       | Persona jurídica o regla PLA-FT             | Lista estructurada; porcentaje/criterio por confirmar.                             |
| Proveedor/contratista del Estado                     | PLA-FT              | Común       | MANUAL      | Usuario/modelo oficial               | CONDICIONAL                       | Según persona y formulario                  | Respuesta explícita cuando aplique.                                                |
| Sujeto obligado                                      | PLA-FT              | Común       | MANUAL      | Usuario/modelo oficial               | MANUAL                            | Siempre                                     | Si es positivo, solicitar tipo y autoridad según modelo.                           |
| Declaraciones PLA-FT y países no cooperantes         | PLA-FT              | Común       | CONTRACTUAL | Texto legal versionado               | MANUAL                            | Siempre al emitir                           | Respuesta explícita + texto contractual exacto.                                    |
| Origen de fondos                                     | PLA-FT              | Común       | MANUAL      | Usuario/modelo oficial               | MANUAL                            | Siempre                                     | Tipo, descripción, importe, moneda y respaldo si corresponde.                      |
| Condición PEP                                        | PEP                 | MRC         | MANUAL      | Modelo oficial MRC aportado          | MANUAL                            | Siempre                                     | Pregunta por cargo público nacional o extranjero.                                  |
| Institución, cargo público y país                    | PEP                 | MRC         | MANUAL      | Usuario/modelo oficial MRC           | CONDICIONAL                       | Si PEP es positivo                          | Fechas/período exactos: Por confirmar.                                             |
| Condición PEP o vinculado a PEP                      | PEP                 | Hogar       | MANUAL      | Modelo oficial Hogar aportado        | MANUAL                            | Siempre                                     | Distinguir PEP propio de vinculación.                                              |
| Persona PEP vinculada, relación, institución y cargo | PEP                 | Hogar       | MANUAL      | Usuario/modelo oficial Hogar         | CONDICIONAL                       | Si PEP/vinculación es positiva              | Aplicar ventana declarada de dos años.                                             |
| Período de dos años                                  | PEP                 | Hogar       | CONTRACTUAL | Modelo oficial Hogar aportado        | CONDICIONAL                       | Según respuesta PEP/vinculado               | Versionar redacción y criterio temporal.                                           |
| Modalidad 1020                                       | Riesgo              | MRC         | HEREDADO    | Carta/cotización MRC                 | HEREDADO_READONLY                 | Siempre para el modelo MRC                  | Código contractual del producto.                                                   |
| Riesgo comercial narrativo                           | Riesgo              | MRC         | MANUAL      | Modelo oficial MRC aportado          | HEREDADO_EDITABLE_CON_ADVERTENCIA | Siempre                                     | Si altera la aceptación técnica, exige recotización; alcance exacto por confirmar. |
| Actividad y ubicación del riesgo                     | Riesgo              | MRC         | HEREDADO    | Carta/cotización MRC                 | HEREDADO_READONLY                 | Siempre                                     | Cambio comercial exige nueva Carta.                                                |
| Artículos asegurados, suma y prima por artículo      | Coberturas          | MRC         | HEREDADO    | Snapshot de Carta                    | HEREDADO_READONLY                 | Según cobertura                             | Preservar orden, moneda y texto.                                                   |
| Cristales                                            | Coberturas          | MRC         | HEREDADO    | Snapshot de Carta/modelo MRC         | HEREDADO_READONLY                 | Si está contratado                          | Monto, alcance, prima y franquicia.                                                |
| CCTV                                                 | Coberturas          | MRC         | HEREDADO    | Snapshot de Carta/modelo MRC         | HEREDADO_READONLY                 | Si está contratado                          | No inferir inclusión desde otro equipo electrónico.                                |
| Franquicia por cobertura y ubicación                 | Coberturas          | MRC         | HEREDADO    | Snapshot de Carta                    | HEREDADO_READONLY                 | Para cada línea aplicable                   | Debe conservar ubicación/condición asociada.                                       |
| Finca, lote, padrón y cuenta catastral               | Riesgo              | Hogar       | MANUAL      | Modelo oficial Hogar aportado        | MANUAL                            | Según disponibilidad/obligación             | Obligatoriedad individual: Por confirmar.                                          |
| Dirección y relación con el inmueble                 | Riesgo              | Hogar       | HEREDADO    | Carta/usuario                        | HEREDADO_EDITABLE_CON_ADVERTENCIA | Siempre                                     | Cambios que alteren el riesgo exigen recotización.                                 |
| Materiales y estructura                              | Riesgo              | Hogar       | MANUAL      | Modelo oficial Hogar aportado        | MANUAL                            | Siempre                                     | Catálogos y opciones exactas por confirmar.                                        |
| Pisos y ocupación                                    | Riesgo              | Hogar       | MANUAL      | Modelo oficial Hogar aportado        | MANUAL                            | Siempre                                     | Incluir uso propio/alquiler/desocupación si figura.                                |
| Linderos y cerramiento                               | Riesgo              | Hogar       | MANUAL      | Modelo oficial Hogar aportado        | MANUAL                            | Siempre o según formulario                  | Estructurar respuestas, no guardar solo narración.                                 |
| Siniestralidad previa                                | Antecedentes        | Hogar       | MANUAL      | Modelo oficial Hogar aportado        | MANUAL                            | Siempre; detalle si es positiva             | Período, cantidad, tipo y monto: Por confirmar.                                    |
| Transferencia de derechos                            | Derechos            | Hogar       | CONTRACTUAL | Modelo oficial Hogar aportado        | CONDICIONAL                       | Si existe acreedor/beneficiario             | Identificación y texto exacto versionados.                                         |
| Equipos electrónicos                                 | Coberturas          | Hogar       | HEREDADO    | Snapshot de Carta/modelo Hogar       | HEREDADO_READONLY                 | Si está contratado                          | Suma, límites, exclusiones y franquicia.                                           |
| Robo a la intemperie                                 | Coberturas          | Hogar       | CONTRACTUAL | Modelo oficial Hogar aportado        | CONDICIONAL                       | Según plan/declaración                      | Condiciones y exclusiones exactas versionadas.                                     |
| Asistencias                                          | Coberturas          | Hogar       | CONTRACTUAL | Modelo oficial Hogar aportado        | CALCULADO_READONLY                | Según plan                                  | Renderizar las incluidas en el snapshot contractual.                               |
| Inhabitabilidad                                      | Coberturas          | Hogar       | CONTRACTUAL | Modelo oficial Hogar aportado        | CONDICIONAL                       | Según plan/siniestro cubierto               | Límite y período: Por confirmar.                                                   |
| Coberturas, sumas y franquicias aceptadas            | Coberturas          | Común       | HEREDADO    | Snapshot de Carta                    | HEREDADO_READONLY                 | Siempre                                     | Cualquier cambio exige recotización.                                               |
| Textos de cobertura, exclusiones y cláusulas         | Condiciones         | Común       | CONTRACTUAL | Snapshot contractual versionado      | CALCULADO_READONLY                | Según producto/plan                         | Agrupables en UI, completos en snapshot/PDF.                                       |
| Prima técnica                                        | Pago                | Común       | CALCULADO   | Resultado persistido                 | CALCULADO_READONLY                | Siempre                                     | No recalcular en Propuesta.                                                        |
| RPF, IVA y premio                                    | Pago                | Común       | CALCULADO   | Plan de pago persistido              | CALCULADO_READONLY                | Siempre                                     | Respetar moneda y redondeo originales.                                             |
| Inicial, cantidad y monto de cuotas                  | Pago                | Común       | CALCULADO   | Plan de pago persistido              | CALCULADO_READONLY                | Según forma elegida                         | Contado no debe inventar cuotas.                                                   |
| Forma de pago elegida                                | Pago                | Común       | HEREDADO    | Selección sobre resultado persistido | HEREDADO_EDITABLE_CON_ADVERTENCIA | Siempre                                     | Cambiar selección no recalcula; debe pertenecer a la Carta.                        |
| Datos/autorización del titular de tarjeta o débito   | Pago                | Común       | CONTRACTUAL | Usuario + texto versionado           | CONDICIONAL                       | Si la forma de pago lo exige                | Evitar persistir datos completos de tarjeta; alcance PCI por confirmar.            |
| Medio de entrega                                     | Entrega             | Común       | MANUAL      | Usuario/modelo oficial               | MANUAL                            | Siempre si el formulario lo exige           | Digital, físico u opciones oficiales: Por confirmar.                               |
| Destinatario, correo o domicilio de entrega          | Entrega             | Común       | MANUAL      | Usuario                              | CONDICIONAL                       | Según medio elegido                         | Puede ser distinto del asegurado.                                                  |
| Lugar y fecha de firma                               | Firmas              | Común       | SISTEMA     | Backend + usuario                    | HEREDADO_EDITABLE                 | Siempre                                     | Fecha de emisión controlada por servidor; lugar editable si corresponde.           |
| Firma del asegurado/tomador                          | Firmas              | Común       | CONTRACTUAL | Modelo oficial + captura de firma    | CONDICIONAL                       | Según roles ocupados                        | Una persona puede firmar por varios roles explícitos.                              |
| Firma de representante legal                         | Firmas              | Común       | CONTRACTUAL | Modelo oficial + captura de firma    | CONDICIONAL                       | Persona jurídica/representación             | Asociada a la parte representada.                                                  |
| Firma del titular del medio de pago                  | Firmas              | Común       | CONTRACTUAL | Modelo oficial + captura de firma    | CONDICIONAL                       | Si el modelo/forma lo exige                 | No confundir con tomador.                                                          |
| Agente, operador y firma interna                     | Firmas              | Común       | SISTEMA     | Sesión/usuarios                      | CALCULADO_READONLY                | Siempre                                     | Snapshot de nombre, rol y contacto.                                                |
| Tipo de firma                                        | Firmas              | Común       | MANUAL      | Usuario/política                     | MANUAL                            | Por firmante                                | Digital, facsimilar o manuscrita; validez por confirmar.                           |
| Sección de maquinaria                                | Riesgo              | Maquinarias | HEREDADO    | Carta de Maquinarias                 | HEREDADO_READONLY                 | Siempre                                     | Automóvil o Incendio; pólizas independientes.                                      |
| Identificación de maquinaria                         | Riesgo              | Maquinarias | HEREDADO    | Carta/snapshot base                  | HEREDADO_READONLY                 | Siempre                                     | Tipo, marca, modelo, serie, año, uso y ubicación.                                  |
| Desglose anual                                       | Cálculo             | Maquinarias | CALCULADO   | Snapshot anual persistido            | CALCULADO_READONLY                | Siempre                                     | Edad, capital, tasa y prima por año; Propuesta no recalcula.                       |
| Ajuste a prima mínima/redondeo                       | Cálculo             | Maquinarias | CALCULADO   | Snapshot anual persistido            | CALCULADO_READONLY                | Cuando no sea cero                          | Mostrar ambos ajustes de forma explícita.                                          |

Los campos marcados **Por confirmar** no pueden resolverse por analogía. La implementación debe
mantener esta matriz como checklist de trazabilidad entre formulario, schema, snapshot y PDF.

## 6. Mapa de reutilización

```text
PropuestaFormalCore
├── Elegibilidad de Carta
├── Borradores y autosave
├── Partes y relaciones
├── KYC / PLA-FT común
├── Selección comercial por referencia
├── Auditoría y versionado
├── Emisión, hash y almacenamiento privado
└── ProductAdapter
    ├── MrcPropuestaAdapter                 [primera implementación]
    ├── HogarPropuestaAdapter               [preparado, no habilitado]
    ├── MaquinariaAutomovilPropuestaAdapter [futuro]
    └── MaquinariaIncendioPropuestaAdapter  [futuro]
```

| Componente                 | Reutilizable                                 | Específico por producto                        |
| -------------------------- | -------------------------------------------- | ---------------------------------------------- |
| Selector de Carta apta     | Sí                                           | Criterio adicional de aptitud del adapter.     |
| Wizard y borrador          | Sí                                           | Secciones condicionales.                       |
| Partes/KYC                 | Sí                                           | Campos y obligatoriedad PEP.                   |
| Selección de variante/pago | Sí                                           | Etiquetas y detalles comerciales.              |
| Snapshot/auditoría/hash    | Sí                                           | `product_code`, versiones de schema/plantilla. |
| Layout PDF                 | Header, footer, tipografía y bloques comunes | Orden, textos legales, anexos y riesgos.       |
| Cálculo                    | No pertenece a Propuesta                     | Calculator de cada producto en Cotizador.      |

## 7. Datos aún no persistidos para Propuesta Formal

Antes de habilitar Propuesta Formal se deben cubrir, como mínimo, estos vacíos:

| Dato                  | Situación actual                                                                         | Necesidad                                                                |
| --------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Carta emitida         | PF-1 la persiste como entidad inmutable con snapshot, archivo privado, hash y versiones. | Exponer su elegibilidad y selección únicamente en PF-2.                  |
| Selección aceptada    | Existen cuatro planes de pago, sin elección final.                                       | Referencias a variante y plan de pago aceptados.                         |
| Borrador de propuesta | No existe.                                                                               | Persistencia desde v1, con revisión optimista o control de concurrencia. |
| Tomador ≠ asegurado   | No modelado.                                                                             | Partes y roles separados.                                                |
| Representante legal   | No modelado.                                                                             | Relación con persona jurídica y vigencia de representación.              |
| Beneficiario final    | No modelado.                                                                             | Lista estructurada y auditable.                                          |
| Origen de fondos      | No estructurado.                                                                         | Concepto, descripción, importe, moneda y respaldo.                       |
| PEP por vinculación   | Campos insuficientes.                                                                    | Persona vinculada, relación, institución, cargo, país y período.         |
| Textos declarativos   | No versionados.                                                                          | Snapshot del texto exacto aceptado al emitir.                            |
| PDF de propuesta      | No existe.                                                                               | Objeto privado, hash y trazabilidad.                                     |
| Auditoría             | No específica de documentos.                                                             | Actor, acción, fecha, estado previo/posterior y metadatos seguros.       |
| Maquinaria plurianual | No existe desglose persistido.                                                           | Snapshot anual exacto y total reconciliado.                              |

## 8. Arquitectura propuesta

**Aprobada:** mantener `routes → controllers → services → repositories`; el frontend nunca accede a
Supabase. Zod valida en el borde de API. La Propuesta consume snapshots y referencias, no calculators.

```text
frontend/propuestas/ (por crear)
        |
        v
routes/propuestas.routes.js (por crear)
        |
        v
controllers/propuestas.controller.js (por crear)
        |
        v
services/propuestas/
├── elegibilidad
├── borradores
├── partes-compliance
├── emision
├── snapshot
└── adapters/
        |
        +--> repositories/propuestas.repository.js (por crear)
        +--> private-document storage adapter (por crear)
        +--> audit repository (por crear)
        |
        v
Supabase PostgreSQL + bucket privado
```

### Responsabilidades

- **Elegibilidad:** valida existencia, ownership/permiso, estado, vigencia, versión, integridad y
  aptitud del producto de la Carta.
- **Borrador:** crea/recupera/actualiza el formulario sin producir efectos comerciales.
- **Adapter de producto:** schema adicional, reglas PEP, secciones PDF y requisitos de emisión.
- **Snapshot:** normaliza un payload canónico, lo serializa determinísticamente y calcula el hash.
- **Emisión:** bloquea el borrador, verifica nuevamente elegibilidad, genera el PDF, lo almacena en
  privado y registra auditoría.
- **Descarga:** autoriza cada lectura; nunca expone una URL pública permanente.

## 9. Modelo de datos

Los nombres siguientes son **propuestos**. Su definición exacta debe cerrarse en el diseño técnico y
materializarse mediante migraciones nuevas; no se debe editar una migración histórica.

### 9.1 Alternativas evaluadas

| Alternativa                                                              | Ventaja                                                       | Riesgo                                                                                            | Decisión                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Tabla polimórfica genérica `documentos_emitidos` como padre autoritativo | Centraliza columnas comunes.                                  | Debilita FKs/cardinalidades, mezcla ciclos distintos y obliga a discriminar tipo para toda regla. | **Descartada como modelo de dominio autoritativo.**                                    |
| Relaciones específicas `cartas_oferta` + `propuestas_formales`           | FKs explícitas, restricciones claras y ciclos independientes. | Repite algunas columnas técnicas.                                                                 | **Recomendada y aprobada.**                                                            |
| Repository/servicio compartido                                           | Reutiliza hashing, storage, descarga y auditoría.             | Ninguno si no oculta reglas de dominio.                                                           | **Recomendado.**                                                                       |
| Tabla técnica de artefactos PDF                                          | Puede centralizar path/hash/tamaño.                           | Se vuelve polimórfica si no conserva relación 1:1 verificable.                                    | Opcional solo con FK 1:1 explícita hacia Carta o Propuesta; nunca fuente de autoridad. |

### 9.2 Cardinalidades y linaje

```text
cotizaciones 1 ─────── N cartas_oferta
                           |
                           | 1 Carta = 1 linaje de Propuesta
                           v
                    propuestas_formales N versiones
                           |
                           +── máximo 1 borrador activo por Carta
                           +── una corrección emitida crea nueva versión
```

- Una cotización puede originar varias Cartas por recotización, corrección comercial o reemplazo.
- Cada Carta pertenece a una sola cotización mediante FK obligatoria.
- Cada fila/version de Propuesta pertenece a una sola Carta mediante FK obligatoria.
- Una Carta mantiene un único linaje lógico de Propuesta con N versiones.
- Debe existir como máximo un borrador activo por Carta; un índice parcial/constraint debe hacerlo
  cumplir, no solo la UI.
- Una Propuesta emitida nunca se sobrescribe: la corrección crea otra versión que referencia a la
  anterior y la reemplaza de forma explícita.

### 9.3 `cartas_oferta`

Campos propuestos:

| Grupo            | Campos conceptuales                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Identidad        | `id`, `cotizacion_id` FK, `numero_carta`, `version`, `producto_codigo`.                       |
| Ciclo            | `estado`, `reemplaza_carta_id` FK nullable, `motivo_reemplazo`, `motivo_anulacion`.           |
| Snapshot         | `snapshot_json`, `snapshot_hash`, `schema_version`, `template_version`, `calculator_version`. |
| PDF privado      | `pdf_storage_path`, `pdf_hash`, `pdf_size`, `pdf_generado_at`.                                |
| Operación        | `idempotency_key`/token de generación, `generada_por`, `created_at`, `updated_at`.            |
| Error controlado | Código/mensaje técnico sanitizado del último fallo y contador/fecha de reintento.             |

El snapshot de Carta contiene variantes y planes de pago disponibles. No se consulta configuración
vigente para reconstruir una Carta ya emitida.

### 9.4 `propuestas_formales`

Campos propuestos:

| Grupo            | Campos conceptuales                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Identidad/linaje | `id`, `carta_oferta_id` FK, `numero_propuesta`, `version`, `reemplaza_propuesta_id` FK nullable.          |
| Ciclo            | `estado`, `revision` para concurrencia, `motivo_reemplazo`, `motivo_anulacion`.                           |
| Selección        | `cotizacion_variante_id` FK y `cotizacion_plan_pago_id` FK.                                               |
| Borrador         | Datos de formulario normalizados o payload de borrador validado, autor y timestamps.                      |
| Emisión          | `snapshot_json`, `snapshot_hash`, `schema_version`, `template_version`, `adapter_version`.                |
| PDF privado      | `pdf_storage_path`, `pdf_hash`, `pdf_size`, `pdf_generado_at`.                                            |
| Operación        | `idempotency_key`/token de generación, `creada_por`, `emitida_por`, timestamps y último error sanitizado. |

Las FKs de selección deben verificarse contra la misma cotización de la Carta. El plan de pago debe
pertenecer a la variante elegida. Esa coherencia debe estar protegida por constraints/RPC transaccional
o por una validación backend con bloqueo adecuado, no por IDs confiados al frontend.

### 9.5 Relaciones auxiliares

`propuesta_partes`

- FK obligatoria a `propuestas_formales`;
- rol: tomador, asegurado, representante legal, beneficiario final, pagador o firmante;
- tipo de persona, identidad normalizada y relación con otra parte cuando corresponda;
- datos específicos validados, sin reemplazar el snapshot final de emisión.

`propuesta_declaraciones`

- FK obligatoria a Propuesta y, cuando aplique, a la parte declarada;
- código estable, respuesta tipada, detalle estructurado, versión y texto legal aceptado.

`propuesta_seleccion_pago` es opcional como tabla 1:1 si se prefiere separar la selección de la
cabecera. Debe usar `propuesta_id` como PK/FK y FKs reales a variante y plan de pago; no duplicar una
selección paralela en JSON sin integridad referencial.

### 9.6 Eventos y artefactos técnicos

- `carta_oferta_eventos`: FK a Carta, actor, transición, fecha, intento/idempotency key y detalle
  sanitizado.
- `propuesta_formal_eventos`: FK a Propuesta, revisión, transición, actor, fecha y detalle sanitizado.
- Se recomienda un repository/servicio común para storage, hashes y descarga.
- Si se crea una tabla técnica de artefactos, la relación debe ser 1:1 y conservar una FK explícita;
  no puede decidir si el dueño es Carta o Propuesta mediante `tipo + id` sin FK.

### 9.7 Restricciones recomendadas

- snapshots y PDFs emitidos son inmutables;
- hashes/versiones son obligatorios en estado `emitida`;
- rutas de storage nunca son URLs públicas;
- una Propuesta referencia exactamente una Carta;
- máximo un borrador activo por Carta;
- versiones son únicas dentro del linaje y monotónicas;
- transiciones, selección, snapshot y registro de evento crítico se confirman atómicamente.

## 10. Snapshot/versionado

### 10.1 Carta Oferta

El snapshot de Carta debe contener todo lo necesario para explicar y regenerar el documento sin leer
catálogos mutables:

- identidad de cotización, producto, plan, agente, cliente y vigencia;
- datos estructurados del riesgo;
- moneda y tipo de cambio aplicado, con fuente y fecha;
- variantes, coberturas, textos legales, franquicias, ajustes y planes de pago;
- resultado comercial completo y reglas de redondeo identificadas por versión;
- versiones de schema, calculator y plantilla.

### 10.2 Propuesta Formal

El snapshot de Propuesta agrega al snapshot/referencia inmutable de Carta:

- variante y plan de pago aceptados;
- partes y relaciones;
- KYC/PLA-FT y PEP;
- origen de fondos;
- textos declarativos exactos;
- firmantes y metadatos de emisión.

### 10.3 Reglas

1. El borrador es mutable y auditable.
2. La emisión crea una versión inmutable.
3. Corregir datos KYC después de emitir produce una nueva versión documental; no pisa la anterior.
4. Cambiar un dato comercial exige recotización y nueva Carta, no una nueva versión KYC sobre la
   misma Carta.
5. El hash se calcula sobre una serialización canónica, no sobre un `JSON.stringify` con orden
   accidental.
6. El PDF tiene su propio hash; snapshot y PDF prueban integridades distintas.

## 11. Multi-producto

**Aprobada:** una Propuesta Formal corresponde a una Carta Oferta y a una póliza/producto. No se
construye una propuesta compuesta obligatoria.

Para Maquinarias:

```text
Maquinarias
├── Sección Automóvil  --> cotización/póliza independiente
│   ├── Maquinaria Premium
│   └── Maquinaria Fuerte
└── Sección Incendio   --> cotización/póliza independiente
    └── Maquinaria Básico
```

Se puede compartir un schema base de identificación de maquinaria y utilidades de cálculo anual,
moneda, formato y snapshot. No se comparten por fuerza:

- cotización;
- correlativo;
- plan/resultado;
- Carta Oferta;
- Propuesta Formal;
- estado de aceptación.

**Pendiente:** decidir si, cuando el cliente cotice ambas secciones, existirá una acción opcional
“usar datos comunes” que precargue identidad/contacto/maquinaria. Aun si se aprueba, será una copia
asistida entre borradores: no unirá pólizas ni generará dependencia de ciclo de vida.

## 12. UX

### 12.1 Dos entradas, un módulo

**Entrada desde Cotizador/Historial**

1. El backend confirma que la Carta está persistida, emitida, vigente y apta.
2. Se muestra **“Preparar Propuesta Formal”**.
3. El módulo abre o recupera el borrador asociado a esa Carta.

**Entrada desde Bienvenida**

1. “Elaborar una Propuesta Formal” deja de ser placeholder.
2. Muestra búsqueda de Cartas aptas por número, cliente, ramo y fecha.
3. Al elegir una Carta entra al mismo módulo y mismo borrador.

### 12.2 Wizard recomendado

```text
1. Carta y selección comercial (solo lectura salvo elección)
2. Tomador, asegurado y representantes
3. KYC / PLA-FT / PEP / origen de fondos
4. Datos específicos del producto
5. Revisión, declaraciones y firmas
6. Emitir Propuesta Formal
```

- Autosave persistente desde el primer paso.
- Indicador de “Guardado” y conflicto de revisión visible.
- Resumen lateral de Carta, variante, moneda y pago aceptado.
- Los datos comerciales se muestran bloqueados con una acción separada “Recotizar”.
- Si la Carta deja de ser apta durante el llenado, el borrador se conserva, pero la emisión se
  bloquea con motivo y enlace al origen.
- No usar “Aceptar cotización” como CTA terminal ambiguo. “Preparar” inicia; “Emitir” cierra.

## 13. Estados/ciclo

### 13.1 Carta Oferta

```text
generando ───────> emitida ───────> reemplazada
    |                 |
    v                 └───────────> anulada
error_pdf
    |
    └── reintento idempotente ───> generando
```

Estados persistidos de Carta: `generando`, `emitida`, `error_pdf`, `reemplazada`, `anulada`.

La vigencia y la aptitud para preparar una Propuesta se **derivan** de estado, fechas, integridad del
snapshot/PDF, resultado comercial y habilitación del producto. No se persiste `vencida` ni `apta` si
pueden calcularse sin ambigüedad. Una Carta reemplazada o anulada nunca es apta.

### 13.2 Propuesta Formal

```text
borrador
   ├────────────> en_revision ────────────> borrador
   |                  |
   |                  v
   |            generando_pdf ───────────> emitida ───> reemplazada
   |                  |                       |
   |                  v                       └───────> anulada
   |              error_pdf
   |                  |
   └──────────────────┴── reintento/corrección
```

Estados persistidos de Propuesta: `borrador`, `en_revision`, `generando_pdf`, `emitida`, `error_pdf`,
`reemplazada`, `anulada`.

La condición “lista para emitir” o readiness se deriva al ejecutar las validaciones de completitud,
elegibilidad de Carta, selección comercial, compliance y adapter. **No se persiste
`lista_para_emitir`** porque puede quedar obsoleta cuando cambie un dato del borrador o venza la Carta.

Transiciones principales:

| Desde           | Hacia           | Condición                                                            |
| --------------- | --------------- | -------------------------------------------------------------------- |
| —               | `borrador`      | Carta apta y usuario autorizado.                                     |
| `borrador`      | `en_revision`   | Solicitud explícita; el borrador se valida y bloquea según política. |
| `en_revision`   | `borrador`      | Observaciones o correcciones de datos no comerciales.                |
| `en_revision`   | `generando_pdf` | Readiness derivado positivo y revalidación transaccional.            |
| `generando_pdf` | `emitida`       | Snapshot, PDF privado, hashes y evento confirmados.                  |
| `generando_pdf` | `error_pdf`     | Fallo controlado sin publicar una emisión incompleta.                |
| `error_pdf`     | `generando_pdf` | Reintento idempotente sobre la misma versión/intento lógico.         |
| `emitida`       | `reemplazada`   | Se emitió una versión correctiva posterior.                          |
| `emitida`       | `anulada`       | Permiso especial, motivo obligatorio y auditoría.                    |

### 13.3 Reintentos idempotentes

- Cada intento de generación usa una idempotency key/token persistido.
- Repetir una solicitud con la misma key devuelve o completa el mismo intento; no crea otra Carta,
  versión de Propuesta ni otro linaje.
- Un fallo deja estado `error_pdf`, conserva el snapshot candidato y registra un evento sanitizado.
- El reintento no incrementa versión salvo que el usuario haya corregido datos y creado una nueva
  versión lógica.
- Si el PDF ya fue almacenado y validado antes de una respuesta HTTP perdida, el retry recupera ese
  artefacto por hash/key en vez de renderizar y emitir dos veces.
- Las transiciones se protegen con compare-and-set/revisión o RPC transaccional para evitar dos
  workers generando la misma versión en paralelo.

No se recomienda reutilizar `cotizaciones.estado = 'aceptada'` como única fuente del estado de la
Propuesta: cotización, Carta y Propuesta tienen ciclos relacionados pero distintos.

## 14. Validaciones

### 14.1 Elegibilidad de Carta

- existe y pertenece al usuario, o el rol tiene permiso de acceso transversal;
- fue emitida y conserva snapshot/hash/PDF íntegros;
- no está vencida, anulada ni reemplazada;
- cotización, variante y plan de pago referenciados son coherentes;
- producto y versión de adapter están habilitados;
- no existe otra Propuesta emitida activa para la misma Carta, salvo regla explícita de reemplazo.

### 14.2 Datos personales/compliance

- tipo de persona determina campos obligatorios;
- tomador y asegurado pueden ser la misma parte, pero la relación debe ser explícita;
- persona jurídica exige representante y beneficiarios finales según la norma/formulario vigente;
- respuestas PEP no pueden quedar implícitas por ausencia;
- si PEP o vinculación PEP es positiva, el detalle requerido por el adapter es obligatorio;
- declaraciones y origen de fondos se validan en backend, no solo en UI;
- fechas, documentos, monedas, importes, emails y teléfonos se normalizan con schemas dedicados.

### 14.3 Integridad comercial

- el frontend envía IDs de selección, no importes recalculados;
- el backend resuelve los IDs contra el snapshot/resultado persistido;
- cualquier divergencia bloquea emisión;
- una edición comercial redirige a recotización.

### 14.4 Maquinarias

- sección, plan, moneda, edad inicial, vigencia y capital deben formar una combinación admitida;
- cada año resuelve la tasa por edad alcanzada;
- no se extrapola más allá de 14 años hasta definir antigüedad máxima;
- el mínimo se aplica una sola vez sobre la suma de primas anuales exactas;
- Premium no tiene franquicia; Fuerte y Básico quedan bloqueados para emisión hasta confirmar su
  franquicia canónica si el dato es contractual;
- Carta y Propuesta consumen el snapshot anual persistido, sin recalcular.

## 15. Seguridad/permisos

- Toda ruta requiere sesión autenticada; las mutaciones mantienen la protección CSRF vigente.
- Los endpoints de Fase 4 deben recibir `req.usuario` y aplicar ownership, corrigiendo el hueco de
  los stubs actuales.
- Separar permisos: preparar/editar borrador, emitir, ver documentos ajenos y anular/reemplazar.
- Un agente solo accede a sus cotizaciones/propuestas salvo permiso explícito.
- El PDF vive en almacenamiento privado; la descarga se autoriza en cada solicitud o mediante URL
  firmada de vida corta.
- No incluir KYC, PEP, documentos ni origen de fondos en logs de aplicación.
- Auditoría es append-only; no debe contener secretos, tokens ni el PDF en base64.
- Hash del snapshot y hash del PDF se verifican al descargar o auditar.
- Los datos sensibles deben tener política de retención, backup, restauración y eliminación legal
  definida antes de producción.
- RLS default-deny no reemplaza la autorización de negocio del backend; ambas capas se conservan.

## 16. Edge cases

| Caso                                            | Comportamiento esperado                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Carta vence mientras se llena el borrador       | Conservar borrador, bloquear emisión y pedir nueva Carta.                                          |
| Catálogo o plantilla cambia                     | La Carta emitida conserva su snapshot; una nueva emisión usa nuevas versiones.                     |
| Se intenta cambiar capital/cobertura            | No editar Propuesta; iniciar recotización.                                                         |
| Dos pestañas editan el mismo borrador           | Revisión optimista; rechazar el guardado obsoleto y permitir reconciliar.                          |
| Dos usuarios intentan emitir                    | Transacción/constraint idempotente: una emisión activa; la segunda recibe conflicto.               |
| Fallo de Puppeteer                              | No marcar emitida; conservar borrador y registrar fallo técnico sin datos sensibles.               |
| PDF almacenado pero transacción falla           | Limpieza compensatoria del objeto huérfano o patrón de estado `pendiente_storage`.                 |
| Transacción cierra pero upload falla            | No exponer documento incompleto; reintento idempotente.                                            |
| Forma de pago deja de estar habilitada          | La referencia histórica sigue válida si pertenecía a la Carta; no consultar configuración vigente. |
| Tomador paga con tarjeta de tercero             | Crear parte `pagador/titular_tarjeta` y firma/declaración condicional.                             |
| Persona cumple varios roles                     | Una parte, varias relaciones; no duplicar identidad sin necesidad.                                 |
| Maquinaria cruza franja etaria durante vigencia | Resolver tasa año por año según edad alcanzada.                                                    |
| Mínimo supera suma plurianual                   | Mostrar `Ajuste a prima mínima` explícito.                                                         |
| Redondeo produce diferencia                     | Mostrar `Ajuste por redondeo` y reconciliar contra el total persistido.                            |
| USD                                             | Nunca aplicar paso de Gs. 1.000.                                                                   |
| Tipo de cambio ausente/vencido                  | Bloquear la combinación que lo requiera hasta aplicar política confirmada.                         |

## 17. Reutilización de código

### 17.1 Núcleo de Propuesta

Reutilizar patrones existentes, no necesariamente archivos completos:

- middleware de auth/CSRF y `verificarPropiedad`;
- capas route/controller/service/repository;
- helpers de errores públicos;
- singleton y cierre limpio de Puppeteer;
- layout/header/footer solo donde el documento oficial lo permita;
- formatos de moneda después de extraer un formatter backend común;
- patrón de snapshots de coberturas, ampliado a documento completo;
- RPC atómico como precedente para emisión transaccional.

### 17.2 Maquinarias

Compartir entre las dos secciones:

- `maquinariaBaseSchema` conceptual;
- cálculo puro de edad alcanzada;
- depreciación compuesta;
- selección de tasa anual;
- armado de desglose anual;
- aplicación única de prima mínima;
- reconciliación y ajustes explícitos;
- formatos sensibles a moneda.

No compartir un único calculator con ramas ocultas para ambos productos. Cada sección debe exponer su
propio calculator/schema/adapter, compuesto sobre utilidades puras comunes.

### 17.3 Fórmula aprobada de Maquinarias

Para año `n`, comenzando en cero:

```text
capital_n = capital_inicial × 0,90^n
edad_n = edad_inicial + n
tasa_n = tasa_aprobada(plan, edad_n)
prima_anual_n = capital_n × tasa_n / 100

prima_exacta_vigencia = SUMA(prima_anual_n)
prima_tecnica = MAX(prima_exacta_vigencia, minimo_unico_plan)
iva = prima_tecnica × 10%
```

Tasas técnicas anuales exactas, sin IVA:

| Edad alcanzada | Maquinaria Premium | Maquinaria Fuerte | Maquinaria Básico |
| -------------- | -----------------: | ----------------: | ----------------: |
| 0–5            |              0,91% |             0,74% |             0,45% |
| 6–9            |              1,00% |             0,81% |             0,50% |
| 10–14          |              1,05% |             0,85% |             0,52% |

Planes y mínimos únicos por toda la vigencia:

| Sección   | Plan               | Franquicia                               | Mínimo único |
| --------- | ------------------ | ---------------------------------------- | -----------: |
| Automóvil | Maquinaria Premium | Sin franquicia                           |      USD 500 |
| Automóvil | Maquinaria Fuerte  | Con franquicia; valor canónico pendiente |      USD 400 |
| Incendio  | Maquinaria Básico  | Pendiente de confirmación                |      USD 100 |

Para Básico, el Excel legacy muestra alternativamente **USD 110** y **Gs. 700.000** como franquicia,
con una conversión inconsistente. Ninguno de esos valores se considera canónico hasta confirmación.
Para todos los planes, el RPF se aplica únicamente según la forma de pago y la política por cuotas
que se confirme para Maquinarias; no se debe heredar un porcentaje o una curva por analogía.

No usar las tasas internas legacy `0,9090909`, `0,7363636` ni `0,4545455`. Tampoco usar como
resultado esperado los totales del Excel legacy, porque fueron calculados con tasas diferentes.

### 17.4 Redondeo recomendado de Maquinarias

1. Conservar precisión en capitales y primas anuales.
2. Sumar los valores exactos.
3. Aplicar el mínimo una sola vez.
4. Redondear al cierre: USD al centavo; PYG al guaraní para prima técnica.
5. Aplicar RPF, IVA, premio y cuotas con estrategia por moneda.
6. Mantener reglas al millar para PYG donde negocio ya las defina; USD nunca usa paso 1.000.
7. Persistir y mostrar `Ajuste a prima mínima` y `Ajuste por redondeo` cuando no sean cero.

La regla exacta de desglose anual visible y su reconciliación final sigue pendiente; esta propuesta de
redondeo no debe convertirse en implementación definitiva sin esa confirmación.

## 18. Archivos afectados

Esta sección enumera impacto futuro. Los archivos marcados **por crear** son sugerencias y no existen
necesariamente hoy.

### 18.1 Existentes que probablemente se modificarán

- `backend/src/routes/cotizaciones.routes.js` y `backend/src/controllers/cotizaciones.controller.js`
  para retirar/deprecar los stubs o mantener compatibilidad controlada.
- `backend/src/services/cotizacion.service.js` ya delega la creación de Carta histórica; futuros
  cambios deben limitarse a conectar PF-2, no a incorporar toda la lógica de Propuesta.
- `backend/src/repositories/cotizaciones.repository.js` para consultas de elegibilidad y referencias.
- `backend/src/services/pdf.service.js` y `backend/src/templates/oferta/` para mantener la revisión
  de renderer/snapshot de Carta cuando cambie contenido de plantilla.
- `backend/src/calculators/utils/plan-pago.js` y helpers de redondeo para estrategia por moneda.
- `frontend/bienvenida/bienvenida.js` para conectar la entrada al módulo único.
- `frontend/cotizar/`, `frontend/historial/` y navegación compartida para el CTA y la familia Maquinarias.
- `docs/PLAN_DESARROLLO.md` y `docs/ESTADO_PROYECTO.md` para trazabilidad.

### 18.2 Sugeridos, por crear durante implementación

- `frontend/propuestas/`.
- `backend/src/routes/propuestas.routes.js`.
- `backend/src/controllers/propuestas.controller.js`.
- `backend/src/services/propuestas/` y `backend/src/services/propuestas/adapters/`.
- `backend/src/repositories/propuestas.repository.js`.
- `backend/src/schemas/propuestas/`.
- `backend/src/templates/propuesta/`.
- adapters de almacenamiento privado y hashing canónico.
- migrations nuevas para documentos, propuestas, partes, declaraciones y auditoría.
- calculator/schema/Carta/Propuesta propios para Maquinaria Automóvil y Maquinaria Incendio.
- utilidades compartidas de maquinaria plurianual y formato monetario backend.

### 18.3 Deudas bloqueantes específicas de Maquinarias

- `plan-pago.js` usa paso 1.000 sin recibir moneda;
- la Carta de Incendio contiene formato `Gs.` en puntos específicos;
- no existe un formatter backend común sensible a moneda;
- no existe cálculo plurianual ni snapshot anual;
- faltan política de RPF, franquicias canónicas, antigüedad máxima, tipo de cambio y textos oficiales.

## 19. Plan por fases

Estas son etapas internas de la **Fase 4 — Propuesta Formal** y de la preparación posterior de
Maquinarias; no alteran por sí mismas la numeración general del proyecto.

### PF-0 — Cerrar insumos y decisiones bloqueantes

- Archivar o transcribir con trazabilidad los modelos oficiales MRC y Hogar aportados durante la
  planificación, hoy no almacenados en `docs/insumos/`.
- Confirmar matriz KYC/PLA-FT/PEP con Compliance.
- Cerrar con Compliance la política de retención documental, anulación y numeración oficial.
- Resolver textos oficiales y firmantes.

### PF-1 — Fundamento documental de Carta Oferta — implementado en repositorio

- La migración 066 define `cartas_oferta` y su relación explícita con `cotizaciones`; queda pendiente
  aplicarla en un entorno controlado.
- La Carta se emite con snapshot completo, versiones, hashes, PDF privado, descarga autorizada y
  pruebas de inmutabilidad/reproducción.
- Las Cartas previas permanecen como legado no reproducible: no se hace backfill ni se inventan datos
  faltantes.

### PF-2 — Núcleo de borradores y elegibilidad

- ✅ API y persistencia de borradores MRC implementadas; migración 069 pendiente de QA.
- ✅ Dos entradas al mismo módulo desde Bienvenida e Historial.
- ✅ Selector de Carta apta con ownership, vigencia y estado derivados en backend/DB.
- ✅ Selección por referencias de variante/pago, sin aceptar importes del frontend.
- ✅ `draft_json` mínimamente validado, readiness informativo y control de concurrencia por `revision`.
- 🔲 Auditoría append-only y modelo completo de partes/declaraciones quedan para el cierre previo a
  emisión; PF-2 no crea PDF ni snapshots de Propuesta Formal.

### PF-3 — MRC end-to-end

- Adapter MRC, PEP y validaciones específicas.
- Plantilla oficial de Propuesta MRC.
- Emisión atómica, almacenamiento privado, hashes y descarga.
- E2E desde Cotizador y Bienvenida.

### PF-4 — Preparación de Hogar

- Mantener el adapter registrado pero deshabilitado hasta que exista flujo previo completo.
- Mapear el modelo oficial Hogar ya aportado, incluidas sus diferencias PEP y contractuales, y cerrar
  únicamente los campos marcados “Por confirmar”.
- Reusar núcleo; no duplicar wizard ni persistencia.

### MQ-0 — Fundamentos de Maquinarias

- Cerrar los siete pendientes de negocio listados en la sección 21.
- Extraer estrategia de moneda/redondeo y formatter backend.
- Diseñar schema base y snapshot anual.
- Crear familia de navegación con secciones independientes.

### MQ-1 — Sección Automóvil

- Implementar calculator/schema/Carta para Premium y Fuerte.
- Aplicar depreciación y tasa por edad alcanzada.
- Persistir desglose anual y ajustes.
- Integrar después su adapter de Propuesta Formal.

### MQ-2 — Sección Incendio

- Implementar calculator/schema/Carta para Básico, sin reutilizar el calculator de Automóvil como
  un producto compuesto.
- Integrar después su adapter de Propuesta Formal.

## 20. Orden recomendado

1. Archivar los modelos oficiales MRC/Hogar aportados y confirmar con Compliance los campos todavía
   marcados “Por confirmar”.
2. Aplicar y verificar en un entorno controlado la entidad histórica de Carta Oferta y el almacenamiento
   privado ya implementados en PF-1.
3. Mantener la Carta inmutable/versionada de PF-1 antes de tocar el formulario de Propuesta.
4. Implementar elegibilidad, borradores y selección por referencia.
5. Implementar partes/KYC/PLA-FT común.
6. Implementar adapter y PDF de MRC.
7. Verificar ambos puntos de entrada end-to-end.
8. Preparar el adapter de Hogar sin habilitarlo hasta completar su flujo previo.
9. Resolver deudas de moneda/redondeo y decisiones abiertas de Maquinarias.
10. Implementar Maquinaria Automóvil y luego Maquinaria Incendio como productos independientes.
11. Conectar sus Propuestas solo después de que cada Carta estructurada sea estable.

Este orden evita construir el techo antes de la estructura: la Propuesta depende de una Carta
inmutable; Maquinarias depende de un motor monetario/plurianual correcto; Hogar depende de su flujo de
cotización y Carta.

## 21. Decisiones previas

### 21.1 Aprobadas — Propuesta Formal

- Dos entradas, un único módulo: Cotizador y Bienvenida.
- Solo parte de una Carta válida, persistida, versionada, asociada y apta según backend/DB.
- Nunca interpreta el PDF; usa datos estructurados y snapshots.
- Borradores persistentes desde v1.
- Carta y Propuesta con snapshots inmutables, PDF privado, hash, versión, versiones de plantilla/schema
  y auditoría.
- Cambios comerciales requieren recotización y nueva Carta.
- Compliance común con diferencias PEP por producto.
- Variante y pago se eligen mediante referencias a resultados persistidos; Propuesta no recalcula.
- Núcleo común con adapters por producto.
- CTA inicial “Preparar Propuesta Formal”; CTA terminal “Emitir Propuesta Formal”.
- Primera implementación recomendada MRC; Hogar preparado pero condicionado a su flujo previo.

### 21.2 Aprobadas — Maquinarias

- Familia `Maquinarias` con submenús `Sección Automóvil` y `Sección Incendio`.
- Pólizas/cotizaciones independientes; no cotización compuesta obligatoria.
- Schema/utilidades base compartidos; calculator/schema/Carta/Propuesta propios por sección.
- Premium sin franquicia y mínimo único USD 500; Fuerte con franquicia y mínimo único USD 400;
  Básico con mínimo único USD 100.
- Tabla anual de tasas 0–5, 6–9 y 10–14 indicada en la sección 17.
- Depreciación compuesta anual del 10% y tasa resuelta por edad alcanzada.
- Prima técnica de vigencia = máximo entre suma exacta anual y mínimo único del plan.
- IVA 10% posterior; RPF pendiente de política específica.
- La tabla de tasas aprobada prevalece sobre tasas internas y totales legacy del Excel.
- Carta y Propuesta consumen snapshots persistidos; no recalculan.

### 21.3 Pendientes que deben bloquear el tramo afectado

1. RPF de Maquinarias por sección, forma y cuotas: 10%, 9,5% o curva vigente.
2. Franquicia canónica de Fuerte y Básico por moneda/cobertura; Premium sin franquicia está cerrado.
3. Antigüedad máxima después de 14 años.
4. Regla exacta de redondeo visible del desglose anual y reconciliación final.
5. Precarga opcional de datos comunes entre secciones, sin unir pólizas.
6. Política de tipo de cambio, fuente y vigencia para Gs./USD.
7. Textos oficiales definitivos de Carta y Propuesta de Maquinarias.
8. Archivo trazable de los modelos oficiales MRC/Hogar aportados y cierre de los campos que la matriz
   mantiene como “Por confirmar”.
9. Política de retención, anulación y reemplazo de documentos KYC sensibles.

## 22. Recomendación final

Implementar Propuesta Formal como un **sistema documental sobre resultados comerciales inmutables**,
no como una segunda pantalla que copia la cotización. La unidad arquitectónica correcta es:

```text
Carta emitida e inmutable
        +
selección persistida de variante/pago
        +
borrador KYC/PLA-FT por partes
        +
adapter del producto
        =
Propuesta Formal emitida, privada, versionada y auditable
```

La primera entrega debe ser MRC end-to-end, con ambos puntos de entrada convergiendo en el mismo
borrador. Hogar debe demostrar la extensibilidad del diseño, pero no adelantarse a su cotizador; su
modelo oficial ya aportado debe archivarse y mapearse con trazabilidad. Maquinarias debe abordarse
después de resolver moneda, redondeo, RPF,
franquicias y antigüedad: ignorar esas deudas produciría cálculos aparentemente correctos pero
contractualmente frágiles.

No se debe implementar ninguna regla abierta usando el Excel legacy como autoridad. La instrucción
del 24/08/2026, las decisiones aprobadas y las futuras confirmaciones formales son la fuente de verdad.
