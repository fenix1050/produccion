# SECURITY.md

## Objetivo

Todo cambio debe seguir Secure by Design.

---

# OWASP Top 10

Todo código nuevo debe validarse contra:

- Broken Access Control

- Cryptographic Failures

- Injection

- Insecure Design

- Security Misconfiguration

- Vulnerable Components

- Authentication Failures

- Integrity Failures

- Logging Failures

- SSRF

---

# Validaciones

Nunca confiar en:

- frontend

- query params

- body

- headers

Todo debe validarse con:

Zod

---

# SQL

Nunca concatenar SQL.

Siempre utilizar parámetros.

---

# Secrets

Nunca subir:

.env

tokens

API Keys

Passwords

Private Keys

---

# Logs

Nunca registrar:

contraseñas

tokens

JWT

cookies

datos bancarios

datos sensibles

---

# Archivos

Validar:

tipo

tamaño

nombre

contenido

MIME

---

# PDFs

Escapar siempre:

HTML

CSS

JavaScript

---

# HTTP

Aplicar:

Helmet

CORS

Rate Limit

Compression

---

# Autenticación

- sesiones válidas

- expiración

- refresh

- logout

---

# Autorización

Toda operación debe validar permisos.

Nunca confiar únicamente en el frontend.

---

# Errores

Nunca exponer:

Stack traces

SQL

Paths

Variables internas

---

# Dependencias

Ejecutar periódicamente:

npm audit

npm outdated

---

# Revisión

Todo Pull Request debe revisar:

✓ seguridad

✓ OWASP

✓ validaciones

✓ logs

✓ errores

✓ autenticación

✓ autorización
