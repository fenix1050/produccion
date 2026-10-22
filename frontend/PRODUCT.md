# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Insurance agents at Aseguradora Tajy (Paraguay) who quote policies day to day, mostly on desktop, often with the client present or on the phone. Secondary users are admins and Risk Analysis staff who maintain rates, plans, coverages, catalogs, roles, and proposal texts.

## Product Purpose

A web quoting system for multiple insurance lines (Auto, Fire, Home, Commercial Multi-risk, Operational All-Risk, Cargo, Life and Personal Accident). Agents quote, generate a Carta Oferta PDF, and issue a Propuesta Formal (with KYC/PLA-FT) once the client accepts. The system keeps a history with sequential numbering. Success is a correct premium and a ready document in as few steps as possible.

## Positioning

Built for Tajy's own tariffs and rules: each line has its own calculator, four payment methods are always computed side by side, and the PDFs follow Tajy's branding and official texts.

## Operating Context

Spanish-language, Paraguay market (amounts in guaraníes). The frontend is vanilla JS with no framework and never talks to Supabase directly; everything goes through the Express API. Static pages per flow: login, welcome, quote, history, proposals, admin, settings. Light and dark themes exist.

## Capabilities and Constraints

- Lines live today: MRC end-to-end; Fire and Life/AP have catalog and calculator; Auto is paused.
- Test and production frontends are separate static deployments.
- Stack is fixed: vanilla JS, no framework.

## Brand Commitments

The Tajy logo (`frontend/logo`) and the current Tajy color palette from the committed visual redesign are binding.

## Evidence on Hand

Real tariffs, plans, and official proposal texts live in the backend and admin panel. No testimonials, customer logos, or benchmarks exist; do not fabricate them.

## Product Principles

- Accuracy over flourish: a wrong or unclear premium is the worst failure.
- Fewest steps from client data to a finished PDF.
- Show all payment methods at once; never hide the comparison.
- Domain terms stay in Spanish and match the insurer's official wording.
- Works at 375px, optimized for desktop.

## Accessibility & Inclusion

WCAG AA: sufficient contrast, full keyboard operation, visible focus, in both light and dark themes.
