# Incendio — Umbral de Inspección Specification

## Purpose

Define the business rule that determines whether an Incendio quote must be issued as "con Inspección" or "sin Inspección" based on the insured sum, and confirm that "Incendio Hipotecario" is exempt from this rule.

## Requirements

### Requirement: Threshold forces "sin Inspección" below the limit

For quotes under plans "Incendio con Inspección" or "Incendio sin Inspección", the system MUST require plan "Incendio sin Inspección" when the total insured sum (sum of declared risk objects) is below the configured inspection threshold.

#### Scenario: Insured sum below threshold requested as sin Inspección

- GIVEN a quote under "Incendio sin Inspección" with total insured sum below the configured threshold
- WHEN the quote is submitted
- THEN the system accepts the quote as "sin Inspección"

#### Scenario: Insured sum below threshold requested as con Inspección

- GIVEN a quote under "Incendio con Inspección" with total insured sum below the configured threshold
- WHEN the quote is submitted
- THEN the system rejects the request with a 422 indicating the sum does not require inspection and must be quoted as "sin Inspección"

### Requirement: Threshold forces "con Inspección" at or above the limit

For quotes under plans "Incendio con Inspección" or "Incendio sin Inspección", the system MUST require plan "Incendio con Inspección" when the total insured sum is at or above the configured inspection threshold, and MUST NOT allow the quote to be emitted as "sin Inspección".

#### Scenario: Insured sum at or above threshold requested as sin Inspección

- GIVEN a quote under "Incendio sin Inspección" with total insured sum at or above the configured threshold
- WHEN the agent submits the quote
- THEN the system rejects the request with a 422 requiring the plan "Incendio con Inspección"

#### Scenario: Insured sum at or above threshold requested as con Inspección

- GIVEN a quote under "Incendio con Inspección" with total insured sum at or above the configured threshold
- WHEN the quote is submitted
- THEN the system accepts the quote as "con Inspección"

### Requirement: Threshold validated on the backend, source of truth

The system MUST enforce the threshold rule as backend validation (calculator/service layer), independent of any frontend suggestion. The threshold value MUST be configurable, not hardcoded in application code.

#### Scenario: Frontend suggestion bypassed

- GIVEN an agent submits a quote directly to the API for "sin Inspección" above the threshold, bypassing any frontend suggestion
- WHEN the backend validates the request
- THEN the system still rejects it with a 422, regardless of what the frontend allowed the agent to select

### Requirement: Hipotecario exempt from the threshold rule

The system MUST NOT apply the inspection-threshold rule to quotes under "Incendio Hipotecario". The agent MAY select this plan directly at any insured sum, with no inspection condition attached.

#### Scenario: Hipotecario quote at a sum above the inspection threshold

- GIVEN a quote under "Incendio Hipotecario" with total insured sum above the configured inspection threshold
- WHEN the quote is submitted
- THEN the system accepts the quote without requiring "con Inspección" or applying any threshold validation
