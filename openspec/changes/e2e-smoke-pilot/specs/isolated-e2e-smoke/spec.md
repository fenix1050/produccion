# Isolated E2E Smoke Specification

## Purpose

Define a deterministic, authenticated browser smoke suite for MRC and Incendio quotation and Carta Oferta PDF boundaries without production data, credentials, Supabase, or external network access. It does not validate database/PostgREST behavior, alter business rules, or cover Auto or paused/future ramos.

## Requirements

### Requirement: Fail-Closed Test Isolation

The smoke suite MUST refuse to start when Supabase credentials are available, an external database or network route is possible, or a repository request is not handled by its test data boundary. It MUST make no production or external request.

#### Scenario: Isolated suite starts

- GIVEN the test-only data boundary and no Supabase credentials
- WHEN the smoke suite starts
- THEN it SHALL use only deterministic test data
- AND it SHALL permit the authenticated flow to run

#### Scenario: Isolation breach is detected

- GIVEN a Supabase credential, external route, or unhandled repository request
- WHEN startup or the flow attempts to use it
- THEN the suite MUST fail before external access occurs
- AND it MUST report the isolation breach

### Requirement: Authenticated Cookie and CSRF Transport

The browser session MUST authenticate through the application and retain the session cookie and CSRF token needed for protected requests. Mutating requests without the required CSRF transport header MUST return 403.

#### Scenario: Browser login establishes transport state

- GIVEN deterministic valid user credentials
- WHEN the browser signs in
- THEN protected requests SHALL succeed using the established session and CSRF transport

#### Scenario: Missing CSRF is rejected

- GIVEN an authenticated browser session
- WHEN it sends a mutating quotation request without `X-CSRF-Token`
- THEN the response MUST be 403

### Requirement: MRC Browser Quote and Offer

The suite MUST complete one MRC quotation through the user interface and validate the generated Carta Oferta is a non-empty PDF beginning with `%PDF-`.

#### Scenario: MRC offer succeeds

- GIVEN an authenticated browser and deterministic MRC catalog and rate data
- WHEN the user completes the MRC quote flow
- THEN the quote SHALL be accepted
- AND its Carta Oferta SHALL be a non-empty `%PDF-` document

#### Scenario: MRC fixture cannot quote

- GIVEN a deterministic MRC fixture configured as invalid
- WHEN the user submits the MRC quote
- THEN the suite MUST observe the application failure
- AND it MUST NOT accept or validate an offer PDF

### Requirement: Incendio Session Continuity and Offer

The suite MUST use the same authenticated browser session to preview and create one Incendio quotation, then validate its Carta Oferta as a non-empty PDF beginning with `%PDF-`.

#### Scenario: Incendio lifecycle succeeds

- GIVEN the browser session completed authentication and deterministic Incendio data
- WHEN it previews and creates an Incendio quote
- THEN both operations SHALL succeed in that session
- AND the resulting offer SHALL be a non-empty `%PDF-` document

#### Scenario: Incendio preview failure prevents creation

- GIVEN an invalid deterministic Incendio request
- WHEN preview is requested in the authenticated session
- THEN the preview MUST fail clearly
- AND no quotation or offer PDF SHALL be created

### Requirement: Reproducible Execution and Cleanup

The suite MUST produce equivalent outcomes in supported local and CI execution with pinned browser availability and deterministic fixtures. Each run MUST remove transient state and leave no persisted data or reusable authenticated session.

#### Scenario: Local and CI execution

- GIVEN the documented local or CI smoke command and required browser runtime
- WHEN the suite executes
- THEN it SHALL run without external service dependencies
- AND it SHALL report the same assertions and exit status for the same fixtures

#### Scenario: Run cleanup

- GIVEN a completed or failed smoke run
- WHEN teardown executes
- THEN it MUST clear browser session and generated transient artifacts
- AND it MUST leave no data outside the isolated test boundary
