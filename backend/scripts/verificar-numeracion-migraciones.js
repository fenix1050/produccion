#!/usr/bin/env node
// Detecta colisiones de numeración en backend/migrations/*.sql — dos archivos
// distintos reclamando el mismo número. Ya pasó 3 veces en este repo (rama A y
// rama B eligen el mismo "próximo número libre" en paralelo sin verlo la una
// a la otra, y la colisión solo aparece al mergear ambas a `main`). Este
// script no puede prevenir la colisión al crearse (no ve ramas remotas), pero
// sí la detecta apenas ambos archivos conviven en el mismo checkout — pensado
// para correr en CI contra `main`, no como reemplazo de coordinación humana.
//
// Uso: node scripts/verificar-numeracion-migraciones.js

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const PATRON_NUMERO = /^(\d+)_.+\.sql$/

async function main() {
  const archivos = await fs.readdir(MIGRATIONS_DIR)
  const porNumero = new Map()

  for (const archivo of archivos) {
    const match = archivo.match(PATRON_NUMERO)
    if (!match) continue
    const numero = match[1]
    if (!porNumero.has(numero)) porNumero.set(numero, [])
    porNumero.get(numero).push(archivo)
  }

  const colisiones = [...porNumero.entries()].filter(([, archivos]) => archivos.length > 1)

  if (colisiones.length === 0) {
    console.log(`OK: ${porNumero.size} migraciones, sin colisiones de numeración.`)
    return
  }

  console.error('Colisión de numeración de migraciones — el mismo número tiene 2+ archivos:\n')
  for (const [numero, archivos] of colisiones) {
    console.error(`  ${numero}: ${archivos.join(', ')}`)
  }
  console.error('\nRenombrá uno de los archivos al siguiente número libre antes de mergear.')
  process.exitCode = 1
}

main()
