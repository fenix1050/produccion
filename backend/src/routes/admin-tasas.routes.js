import { Router } from 'express';
import multer from 'multer';
import * as tasasController from '../controllers/tasas.controller.js';

// Archivo temporal en disco: xlsx.readFile necesita una ruta, no un buffer en memoria.
const upload = multer({ dest: 'uploads/' });

export const router = Router();

router.post('/importar', upload.single('archivo'), tasasController.importar);
