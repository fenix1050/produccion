# Propuestas Formales — Listado Specification

## Purpose

Provide a listing endpoint and page for Propuestas Formales, scoped by agent/admin, with search, state filtering, pagination, and row-level action flags (`puede_continuar`, `puede_descargar`, `puede_anular`) computed server-side.

## Requirements

### Requirement: SQL scoping and pagination function (migración 075)

The system MUST provide a `SECURITY INVOKER` SQL function `listar_propuestas_formales(...)` that resolves the cross search (propuesta ↔ carta ↔ cotización) and returns `COUNT(*) OVER () AS total_registros` per row for pagination.

The function MUST scope rows to `p_es_admin OR c.agente_id = p_usuario_id`.

The function MUST NOT change EXECUTE grants outside `service_role`: after DROP+CREATE, the migration MUST reapply the exact ACL of `listar_cartas_oferta_aptas_propuesta` (070:325-331) via explicit `REVOKE ALL` then `GRANT EXECUTE TO service_role` statements, for both the modified function and the new one.

The migration MUST add an index `propuestas_formales_updated_at_idx` supporting `ORDER BY updated_at DESC, id DESC`.

The change to `listar_cartas_oferta_aptas_propuesta` MUST be additive only: it MUST keep all existing output columns and MUST add `tiene_propuesta`, `propuesta_actual_id`, `propuesta_actual_estado`, `propuesta_actual_numero` without removing or renaming existing columns, so `supabase.rpc()` callers that map by column name (e.g. the wizard) keep working unmodified.

#### Scenario: Admin sees all propuestas

- GIVEN a user with `p_es_admin = true`
- WHEN `listar_propuestas_formales` is invoked with no `estado` filter
- THEN rows for all agents are returned, each row tagged with `total_registros` equal to the full matching count

#### Scenario: Agent sees only own propuestas

- GIVEN a user with `p_es_admin = false` and `p_usuario_id = X`
- WHEN `listar_propuestas_formales` is invoked
- THEN only rows where the underlying carta's `agente_id = X` are returned

#### Scenario: ACL reapplied after DROP+CREATE

- GIVEN migration 075 has run against a test database
- WHEN `pg_proc.proacl` is inspected for both `listar_cartas_oferta_aptas_propuesta` and `listar_propuestas_formales`
- THEN only `service_role` holds EXECUTE, matching the pre-migration ACL of `listar_cartas_oferta_aptas_propuesta`
- AND no EXECUTE grant exists for `anon` or `authenticated`

#### Scenario: Old wizard code is unaffected by additive columns

- GIVEN a backend deployed before migration 075
- WHEN it calls `listar_cartas_oferta_aptas_propuesta` after 075 is applied
- THEN it continues to receive all previously existing columns unchanged and ignores the new columns

### Requirement: GET /propuestas endpoint contract

The system MUST expose `GET /propuestas` accepting query parameters `busqueda` (string, optional), `estado` (one of the 7 domain states or `'activa'`, optional), `carta_oferta_id` (optional), `limit` (integer 1–100, default defined by service), and `offset` (integer ≥ 0, default 0).

The endpoint MUST respond with `{ data: [...], count: <integer> }`, where `count` reflects the total matching rows regardless of pagination.

The endpoint MUST scope results to the authenticated agent unless the caller is an admin, mirroring the SQL function's scoping — never trusting a client-supplied agent identifier.

The endpoint MUST NOT include `agente_id` in any returned row.

When `estado='activa'` is requested, the system MUST expand it server-side into the set of non-terminal states (i.e. excluding `anulada` and `reemplazada`, and excluding any other terminal states defined by the domain) before querying.

Each returned row MUST include three boolean flags computed by the service, not the client: `puede_continuar`, `puede_descargar`, `puede_anular`.

`puede_descargar` MUST be `true` if and only if the propuesta's `estado` is `emitida` or `anulada` — mirroring exactly the guard in `emision.service.js:128` (`descargarPropuesta`). It MUST be `false` for `reemplazada` and every other state.

#### Scenario: Agent requests listing without filters

- GIVEN an authenticated agent with existing propuestas
- WHEN `GET /propuestas` is called with no query params
- THEN the response is `{ data, count }` with only that agent's propuestas, `agente_id` absent from each row, and default pagination applied

#### Scenario: Admin requests listing

- GIVEN an authenticated admin user
- WHEN `GET /propuestas` is called
- THEN the response includes propuestas across all agents

#### Scenario: Search by número, carta or client

- GIVEN propuestas exist matching a proposal number, a carta number, or a client name
- WHEN `GET /propuestas?busqueda=<term>` is called with any of those terms
- THEN matching rows are returned

#### Scenario: Filter by estado=activa expands to non-terminal states

- GIVEN propuestas exist in multiple states including `anulada` and `reemplazada`
- WHEN `GET /propuestas?estado=activa` is called
- THEN rows in `anulada` and `reemplazada` are excluded from the result

#### Scenario: puede_descargar is true only for emitida and anulada

- GIVEN propuestas exist in states `emitida`, `anulada`, and `reemplazada`
- WHEN they are returned by `GET /propuestas`
- THEN `puede_descargar` is `true` for the `emitida` and `anulada` rows
- AND `puede_descargar` is `false` for the `reemplazada` row

#### Scenario: Pagination via limit and offset

- GIVEN more matching rows exist than `limit`
- WHEN `GET /propuestas?limit=10&offset=10` is called
- THEN the response contains at most 10 rows and `count` reflects the total independent of `limit`/`offset`

#### Scenario: Invalid limit is rejected

- GIVEN `limit=0` or `limit=101` is supplied
- WHEN `GET /propuestas` is called
- THEN the request is rejected with a validation error, per the existing Zod-at-the-edge convention

### Requirement: Cancel (anular) action from the listing

The system MUST require a `motivo` between 3 and 1000 characters (inclusive) to anular a propuesta from this listing, using the existing `anularPropuesta` service guard (`emision.service.js:141-145`).

#### Scenario: Anular with valid motivo

- GIVEN a propuesta whose `puede_anular` flag is `true`
- WHEN the anular action is invoked with a `motivo` of 10 characters
- THEN the propuesta is cancelled and the listing reflects the new state

#### Scenario: Anular with motivo below minimum

- GIVEN a propuesta whose `puede_anular` flag is `true`
- WHEN the anular action is invoked with a `motivo` of 2 characters
- THEN the request is rejected and the propuesta state is unchanged

### Requirement: Propuestas listing page

The frontend page at `frontend/propuestas-listado/` MUST render the paginated list, a search input, a state filter, and per-row actions gated strictly by the flags returned by the backend (never recomputed client-side).

The page MUST present a modal for the anular action requiring a non-empty `motivo` before submission is enabled, enforcing the same 3–1000 character bound as the backend.

The page MUST map a `403` response to an authorization-denied message and a `409` response to a state-conflict message (e.g. the propuesta changed state concurrently), without exposing raw server error bodies.

#### Scenario: Row actions reflect backend flags

- GIVEN a row where `puede_continuar=false`, `puede_descargar=true`, `puede_anular=false`
- WHEN the row renders
- THEN only the download action is enabled

#### Scenario: 409 on anular is surfaced as a conflict message

- GIVEN the anular request returns HTTP 409
- WHEN the modal submit handler receives the response
- THEN a state-conflict message is shown and the modal remains open with the entered `motivo` preserved

### Requirement: Sidebar item with independent active key

The sidebar MUST expose a navigation item for this listing using the active key `propuestas-listado`, distinct from the wizard's existing `propuestas` key, so highlighting one does not affect the other.

#### Scenario: Sidebar highlights the listing item independently

- GIVEN the user is on the propuestas-listado page
- WHEN the sidebar renders
- THEN the `propuestas-listado` item is highlighted active and the wizard's `propuestas` item is not
