import { Router } from 'express';
import multer from 'multer';
import * as tasasController from '../controllers/tasas.controller.js';
import { requireRole, requireTasasEdit } from '../middleware/auth.js';

// Archivo temporal en disco: xlsx.readFile necesita una ruta, no un buffer en memoria.
const upload = multer({ dest: 'uploads/' });

export const router = Router();

// requireAuth ya corre en routes/index.js antes de llegar acá; sumamos el gate de rol +
// permiso específico de edición de tasas.
router.post(
  '/importar',
  requireRole('admin'),
  requireTasasEdit,
  upload.single('archivo'),
  tasasController.importar
);
