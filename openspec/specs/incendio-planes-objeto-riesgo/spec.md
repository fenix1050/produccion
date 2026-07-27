# Incendio — Planes por Objeto de Riesgo Specification

## Purpose

Define how Incendio quotes premium for the three new plans (Hipotecario, con Inspección, sin Inspección) using a global rate per risk type broken down into four optional risk objects, and the plan catalog/legal-content requirements for those plans.

## Requirements

### Requirement: Global rate breakdown by risk object

The system MUST calculate the premium for plans using the `objeto_riesgo` mechanics as the sum of the rates applied to each declared risk object: Edificio, Instalaciones, Contenido Mueble y Equipos, Contenido Mercadería. For risk type "VIVIENDA" the confirmed per-object rates are Edificio 0.90%, Instalaciones 0.90%, Contenido Mueble y Equipos 1.34%, Contenido Mercadería 1.34%, derived from a global rate of 2.24% (min 0.6%, max 35.48%).

#### Scenario: Premium for a fully declared Vivienda risk

- GIVEN a quote for risk type "VIVIENDA" with insured sums declared for all 4 risk objects
- WHEN the premium is calculated
- THEN the system applies 0.90% to Edificio, 0.90% to Instalaciones, 1.34% to Contenido Mueble y Equipos, and 1.34% to Contenido Mercadería
- AND sums the four resulting amounts into the base premium

#### Scenario: Rate table is data-driven, not hardcoded per risk type

- GIVEN a new risk type with its own global/min/max rate is added via a seed row
- WHEN a quote is created for that risk type
- THEN the system resolves rates from the rate table without requiring a code change

### Requirement: Optional risk objects

The system MUST treat all four risk objects as optional per quote. The premium calculation MUST sum only the risk objects the agent declared with a positive insured sum.

#### Scenario: Vivienda without Contenido Mercadería

- GIVEN a quote for "VIVIENDA" declaring only Edificio and Instalaciones (no Contenido Mueble y Equipos, no Contenido Mercadería)
- WHEN the premium is calculated
- THEN only the Edificio and Instalaciones rates are applied
- AND the omitted objects contribute zero to the premium

#### Scenario: No risk object declared

- GIVEN a quote request with all four risk-object insured sums empty
- WHEN the agent submits the quote
- THEN the system rejects the request with a 422 requiring at least one declared risk object

### Requirement: Rate floor and cap per risk type

The system MUST clamp the effective rate applied to a risk type's premium calculation between that risk type's `tasa_minima` and `tasa_maxima`.

#### Scenario: Computed rate below the floor

- GIVEN a risk type whose computed effective rate falls below its configured `tasa_minima`
- WHEN the premium is calculated
- THEN the system applies `tasa_minima` instead of the computed rate

### Requirement: Catalog of the three new plans

The system MUST offer three selectable plans under ramo Incendio: "Incendio Hipotecario", "Incendio con Inspección", "Incendio sin Inspección", each using the `objeto_riesgo` rate mechanics and each able to override rates independently via a plan-scoped rate entry.

#### Scenario: Plan-specific rate override

- GIVEN "Incendio con Inspección" has a plan-scoped rate override for Edificio
- WHEN a quote is created under that plan
- THEN the system applies the plan-scoped rate instead of the risk-type default

### Requirement: Hipotecario legal content

The system MUST associate the following mandatory legal terms with the "Incendio Hipotecario" plan as structured data: first absolute risk clause, requirement that the building be finished, exclusion of vendaval/huracán/ciclón/tornado coverage when the building lacks all four walls, requirement of an appraisal report ("informe de tasación"), and electrical-maintenance recommendations with a duty to notify the company. Rendering this content into the Carta Oferta PDF is out of scope for this change.

#### Scenario: Legal terms available for a Hipotecario quote

- GIVEN a quote created under "Incendio Hipotecario"
- WHEN the quote's plan data is retrieved
- THEN the five mandatory legal clauses above are present as structured plan content
