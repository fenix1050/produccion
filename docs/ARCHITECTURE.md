# Arquitectura

## Objetivo

Este sistema sigue una arquitectura por capas con separación estricta de responsabilidades.

Frontend
↓

Express Router

↓

Controller

↓

Service

↓

Repository

↓

Supabase

---

# Responsabilidades

## Routes

- únicamente definen endpoints
- no contienen lógica

## Controllers

- reciben Request
- validan parámetros
- llaman a Services
- devuelven Response

## Services

- contienen TODA la lógica de negocio

## Repositories

- acceso exclusivo a Supabase

## Calculators

Cada ramo implementa la interfaz `RamoCalculator` — definición completa y actualizada en `CLAUDE.md` (no se repite acá para evitar desincronización).

---

# Flujo de una cotización

Usuario

↓

Frontend

↓

POST /cotizar

↓

Controller

↓

Service

↓

Calculator

↓

Repository

↓

Supabase

↓

PDF

↓

Frontend

---

# Principios

- DRY
- SOLID
- Composition over inheritance
- Zod para todas las validaciones
- Nunca acceder a Supabase desde Controllers
- Nunca acceder al DOM desde lógica de negocio
- Toda lógica compartida debe abstraerse
