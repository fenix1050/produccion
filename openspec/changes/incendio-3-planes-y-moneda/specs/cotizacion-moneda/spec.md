# Cotización — Moneda Specification

## Purpose

Define cross-cutting currency support for quotes: agent-selected currency (Gs. or USD) per quote, exchange-rate snapshotting sourced from dolarPy, persistence, presentation, and historial aggregation safety.

## Requirements

### Requirement: Currency selection per quote

The system MUST allow the agent to select the quote currency (Gs. or USD) independently for each quote, regardless of plan. The system MUST validate the selected currency with Zod at the API boundary and MUST persist it as `moneda` on the quote record, defaulting to `PYG` when not provided by legacy flows.

#### Scenario: Agent quotes in USD

- GIVEN an agent creating a new quote selects currency USD
- WHEN the quote is submitted
- THEN the system validates and persists `moneda = USD` on the quote
- AND all monetary output fields are computed and formatted in USD

#### Scenario: Invalid currency rejected

- GIVEN a quote request with a `moneda` value outside the allowed set
- WHEN the request reaches the API
- THEN the system rejects it with a Zod validation error before reaching business logic

### Requirement: Exchange-rate snapshot at quote time

The system MUST populate a current exchange-rate table (SET quotation) automatically from the dolarPy public API (`GET https://dolar.melizeche.com/api/1.0/`, fields `dolarpy.set.compra` / `dolarpy.set.venta`). Each quote MUST persist the exchange rate in effect at the moment it was created as an immutable snapshot; this rate MUST NOT be recalculated retroactively after the quote is emitted.

#### Scenario: Exchange rate snapshotted at creation

- GIVEN the current SET buy/sell rate at quote time is a known value
- WHEN a quote is created
- THEN the system persists that exact rate value alongside the quote
- AND a later change to the current rate does not alter the already-emitted quote's stored rate

### Requirement: dolarPy fetch failure fallback

The system MUST NOT block quote creation when the dolarPy API is unreachable or returns an error. On fetch failure, the system MUST fall back to the last successfully cached exchange rate and MUST log that a stale value was used.

#### Scenario: dolarPy unavailable during quote creation

- GIVEN the dolarPy API call fails or times out
- WHEN an agent creates a quote requiring the current exchange rate
- THEN the system uses the last cached known rate as the snapshot
- AND logs that a stale/cached rate was used
- AND the quote is still created successfully

#### Scenario: No cached rate available yet

- GIVEN dolarPy has never been successfully fetched and no cached rate exists
- WHEN a quote requiring the exchange rate is created
- THEN the system rejects the request with an explicit error indicating no exchange rate is available, rather than silently using a zero or guessed value

### Requirement: Historial does not aggregate across currencies

The system MUST display the currency for each quote row in historial and MUST NOT sum or aggregate monetary totals across quotes with different `moneda` values.

#### Scenario: Historial totals per currency

- GIVEN the historial contains quotes in both PYG and USD
- WHEN a total/summary is displayed
- THEN totals are computed and shown separately per currency
- AND no combined cross-currency sum is presented

### Requirement: Currency-specific minimum premium floor

The system MUST maintain `prima_tecnica_minima` (and any other monetary floor) as a value specific to each currency, with no implicit conversion between currencies applied to floors.

#### Scenario: Minimum premium applied in the quote's own currency

- GIVEN a plan has separate configured minimum premiums for PYG and USD
- WHEN a quote is created in USD
- THEN the system compares the calculated premium against the USD-specific minimum, not a converted PYG value

### Requirement: Legacy USD-only plan marked and formatted correctly

The system MUST mark plan "MAQUINARIA BASICO" quotes as currency USD and MUST format their monetary output using USD formatting, closing the gap introduced in migration 013 where USD amounts were displayed with `fmtGs`.

#### Scenario: Maquinaria Basico quote displayed in USD

- GIVEN an existing or new quote under "MAQUINARIA BASICO"
- WHEN its amounts are displayed in the UI or PDF
- THEN they are formatted using the USD formatter, not `fmtGs`
