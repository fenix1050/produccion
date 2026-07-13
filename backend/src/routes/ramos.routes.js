import { Router } from 'express';
import * as ramosController from '../controllers/ramos.controller.js';

export const router = Router();

router.get('/', ramosController.listarRamos);
router.get('/rubros-actividad', ramosController.listarRubrosActividad);
router.get('/:id/planes', ramosController.listarPlanesDeRamo);
