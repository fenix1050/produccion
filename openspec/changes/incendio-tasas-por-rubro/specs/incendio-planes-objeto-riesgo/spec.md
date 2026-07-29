# Delta for incendio-planes-objeto-riesgo

## MODIFIED Requirements

### Requirement: Global rate breakdown by risk object

The system MUST calculate the premium for plans using the `objeto_riesgo` mechanics as the sum of the rates applied to each declared risk object: Edificio, Instalaciones, Contenido Mueble y Equipos, Contenido Mercadería. For risk type "VIVIENDA" the confirmed per-object rates are Edificio 0.90%, Instalaciones 0.90%, Contenido Mueble y Equipos 1.34%, Contenido Mercadería 1.34%, derived from a global rate of 2.24% (min 0.6%, max 35.48%). The rate table MUST cover the full risk-type catalog imported from the rubro pivot (~207 risk types), each with its own global/min/max rate. For every risk type in the catalog, the per-object rates MUST be derived from that risk type's global rate using the fixed breakdown Edificio 40%, Instalaciones 40%, Contenido Mueble y Equipos 60%, Contenido Mercadería 60%, rounded to 2 decimals.
(Previously: the 40/40/60/60 breakdown and confirmed per-object rates were documented only for "VIVIENDA"; other risk types had no seeded rates and quoting them failed.)

#### Scenario: Premium for a fully declared Vivienda risk

- GIVEN a quote for risk type "VIVIENDA" with insured sums declared for all 4 risk objects
- WHEN the premium is calculated
- THEN the system applies 0.90% to Edificio, 0.90% to Instalaciones, 1.34% to Contenido Mueble y Equipos, and 1.34% to Contenido Mercadería
- AND sums the four resulting amounts into the base premium

#### Scenario: Rate table is data-driven, not hardcoded per risk type

- GIVEN a new risk type with its own global/min/max rate is added via a seed row
- WHEN a quote is created for that risk type
- THEN the system resolves rates from the rate table without requiring a code change

#### Scenario: Premium for a non-Vivienda risk type from the pivot catalog

- GIVEN a quote for risk type "SILOS" (or any other risk type seeded from the pivot) with insured sums declared for all 4 risk objects, and a global rate G for that risk type
- WHEN the premium is calculated
- THEN the system applies 0.40×G to Edificio, 0.40×G to Instalaciones, 0.60×G to Contenido Mueble y Equipos, and 0.60×G to Contenido Mercadería, each rounded to 2 decimals
- AND the quote succeeds without a 422 error

## ADDED Requirements

### Requirement: Ramo-scoped risk-type catalog endpoint

The system MUST require a `ramo_id` (positive integer) query parameter on `GET /ramos/rubros-actividad` and `GET /admin/rubros-actividad`, resolving which rubros to return via a many-to-many rubro↔ramo relation instead of the legacy single-value `grupo` attribute. A rubro MAY belong to more than one ramo at the same time, each with its own independently confirmed rates.

#### Scenario: Incendio selector excludes rubros exclusive to another ramo

- GIVEN a rubro associated only with ramo MRC
- WHEN an agent requests the rubro list with `ramo_id` set to Incendio's id
- THEN that rubro MUST NOT appear in the response

#### Scenario: MRC/TRO selectors keep their existing rubros

- GIVEN a rubro that was already associated with ramo MRC or ramo TRO before this change
- WHEN an agent requests the rubro list with that ramo's `ramo_id`
- THEN the rubro still appears in the response, unaffected by the new Incendio rubros

#### Scenario: Rubro shared by two ramos appears in both, without duplicates

- GIVEN a rubro associated with both ramo MRC and ramo Incendio (e.g. "CHANCHERIAS")
- WHEN an agent requests the rubro list for MRC's `ramo_id` and, separately, for Incendio's `ramo_id`
- THEN the rubro appears exactly once in each of the two responses

#### Scenario: Missing or invalid ramo_id is rejected

- GIVEN a request to `GET /ramos/rubros-actividad` or `GET /admin/rubros-actividad` with no `ramo_id`, a non-numeric `ramo_id`, or `ramo_id <= 0`
- WHEN the request is processed
- THEN the system responds 400 and does NOT return the unfiltered catalog

#### Scenario: Rubro without a confirmed rate still rejects the quote

- GIVEN a rubro that is associated with ramo Incendio (so it appears in the Incendio selector) but has no confirmed rate row in `tipos_riesgo_incendio`
- WHEN an agent submits a quote for that rubro under ramo Incendio
- THEN the system rejects the request with 422 "Tipo de Riesgo sin tasas confirmadas", unchanged from before this change
