import { Router } from 'express'

import * as ramosController from '../controllers/ramos.controller.js'

export const router = Router()

router.get('/:id/coberturas', ramosController.listarCoberturasDePlan)
router.get('/:id/clausulas', ramosController.listarClausulasObligatoriasDePlan)
// TODO Fase 3: router.get('/:id/servicios', ...)
