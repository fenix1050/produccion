import { Router } from 'express'

import * as cotizacionesController from '../controllers/cotizaciones.controller.js'
import { pdfRateLimiter } from '../middleware/rate-limit.js'

export const router = Router()

router.post('/calcular', cotizacionesController.calcular)
router.post('/', cotizacionesController.crear)
router.get('/', cotizacionesController.listar)
router.get('/:id', cotizacionesController.obtener)
router.put('/:id', cotizacionesController.actualizar)
router.get('/:id/pdf-oferta', pdfRateLimiter, cotizacionesController.pdfOferta)

// La Propuesta Formal vive en /propuestas (ver propuestas.routes.js) — no hay rutas de
// aceptar / pdf-propuesta acá.
