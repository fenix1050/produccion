import { Router } from 'express';
import * as cotizacionesController from '../controllers/cotizaciones.controller.js';

export const router = Router();

router.post('/calcular', cotizacionesController.calcular);
router.post('/', cotizacionesController.crear);
router.get('/', cotizacionesController.listar);
router.get('/:id', cotizacionesController.obtener);
router.put('/:id', cotizacionesController.actualizar);
router.get('/:id/pdf-oferta', cotizacionesController.pdfOferta);

// Fase 4 — Propuesta Formal
router.post('/:id/aceptar', cotizacionesController.aceptar);
router.get('/:id/pdf-propuesta', cotizacionesController.pdfPropuesta);
