import { Router } from 'express'

import * as propuestasController from '../controllers/propuestas.controller.js'
import { pdfRateLimiter } from '../middleware/rate-limit.js'

export const router = Router()

router.get('/cartas-aptas', propuestasController.listarCartas)
router.get('/cartas/:id', propuestasController.obtenerCarta)
router.post('/cartas/:id/borrador', propuestasController.crearBorrador)
router.get('/textos', propuestasController.listarTextos)
router.post('/textos', propuestasController.publicarTexto)
router.get('/:id', propuestasController.obtenerBorrador)
router.put('/:id', propuestasController.actualizarBorrador)
router.post('/:id/emitir', propuestasController.emitir)
router.get('/:id/pdf', pdfRateLimiter, propuestasController.pdf)
router.post('/:id/anular', propuestasController.anular)
