import { Router } from 'express'

import * as propuestasController from '../controllers/propuestas.controller.js'

export const router = Router()

router.get('/cartas-aptas', propuestasController.listarCartas)
router.get('/cartas/:id', propuestasController.obtenerCarta)
router.post('/cartas/:id/borrador', propuestasController.crearBorrador)
router.get('/:id', propuestasController.obtenerBorrador)
router.put('/:id', propuestasController.actualizarBorrador)
