# TESTING.md

## Objetivo

Toda modificación del sistema debe demostrar que no rompe funcionalidades existentes.

No se considera una tarea terminada hasta completar las validaciones indicadas en este documento.

---

# Filosofía

Priorizar:

1. Prevención
2. Automatización
3. Repetibilidad
4. Cobertura funcional

---

# Checklist obligatorio

Antes de realizar cambios:

- comprender el requerimiento
- revisar documentación
- revisar arquitectura
- revisar dependencias mediante CodeGraph

Después de modificar código:

- verificar errores de consola
- verificar logs backend
- validar respuestas HTTP
- revisar manejo de errores
- validar permisos
- validar casos borde

---

# QA Manual

Cada nueva funcionalidad debe probar:

## Happy Path

Caso esperado.

## Boundary Cases

Valores mínimos

Valores máximos

Valores nulos

Valores vacíos

Caracteres especiales

---

## Casos inválidos

Entradas inválidas

Tipos incorrectos

Objetos incompletos

Permisos insuficientes

---

# Backend

Verificar:

- status HTTP
- tiempos de respuesta
- manejo de excepciones
- rollback
- validación Zod
- repositorios

---

# Frontend

Verificar:

- responsive
- estados loading
- estados error
- estados vacíos
- accesibilidad
- navegación

---

# PDFs

Verificar:

- formato
- tipografía
- márgenes
- imágenes
- numeración
- datos

---

# Base de datos

Validar:

- integridad
- foreign keys
- índices
- migraciones

---

# Performance

No aceptar cambios que:

- aumenten consultas innecesarias
- dupliquen cálculos
- recorran arrays repetidamente

---

# Definition of Done

Una tarea sólo está terminada cuando:

✓ compila

✓ funciona

✓ pasó QA

✓ documentación actualizada

✓ sin errores

✓ aprobada
