import { Router } from 'express';
import * as ramosController from '../controllers/ramos.controller.js';

export const router = Router();

router.get('/:id/coberturas', ramosController.listarCoberturasDePlan);
// TODO Fase 3: router.get('/:id/servicios', ...)
