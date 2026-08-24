# Verification workflow

Use the root verification scripts before delivering a change. They compose existing checks; they do not install dependencies or browser binaries.

## Quick path

```bash
npm run verify:fast
```

`verify:fast` runs the formatting check, ESLint, backend and frontend unit tests, and migration-numbering validation.

Run the full workflow when the change affects browser behavior, API integration, PDF generation, the E2E harness, or a release candidate:

```bash
npm run verify
```

`verify` runs `verify:fast` followed by `verify:e2e`. To run only the isolated browser smoke:

```bash
npm run verify:e2e
```

## Browser prerequisite

Install the existing browser dependencies before running the smoke on a machine that does not already have them:

```bash
npm run e2e:install:chromium --workspace=backend
npm run e2e:install:puppeteer --workspace=backend
```

## Temporary CI formatting gate

Until the formatting-cleanup chain is complete, CI checks only Prettier-eligible tracked files changed from the event base revision:

```bash
npm run format:check:changed -- <base-revision>
```

The script fails when the base revision is missing, invalid, or unrelated to `HEAD`; it succeeds when no eligible files changed. This temporary gate isolates the 318-file formatting baseline so unrelated work can continue to use formatting enforcement without reformatting the repository in one change.

CI checks out full history, passes the pull request base SHA or push `before` SHA explicitly, runs this changed-files check before lint, tests, migration validation, and the existing E2E smoke. Browser setup remains unchanged.

`format:check` and `verify` remain the full-repository gates for local delivery. After the last formatting slice, restore CI to `npm run verify` and remove this temporary changed-files gate.

## Isolated smoke coverage

The smoke is deterministic for its fixture-backed MRC and Incendio flow. It starts loopback-only API and static frontend servers, rejects configured production database credentials and non-loopback network targets, replaces repositories with fixture data, and verifies login, quote calculations, CSRF behavior, invalid-input boundaries, and generated PDF responses.

It does not validate live Supabase data, production credentials or infrastructure, every ramo, all browser layouts, or visual PDF fidelity. Capture focused UI or PDF evidence when a change affects those surfaces.

## Delivery evidence checklist

- [ ] Run the relevant canonical command and record its result.
- [ ] Include focused unit or smoke evidence for changed behavior.
- [ ] Include UI screenshots or PDF output evidence when those surfaces changed.
- [ ] State migrations, deployment impact, and intentionally unverified areas.
