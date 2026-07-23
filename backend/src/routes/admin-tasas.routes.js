import { Router } from 'express';
import multer from 'multer';
import * as tasasController from '../controllers/tasas.controller.js';
import { requireRole, requireTasasEdit } from '../middleware/auth.js';

const MIMETYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Archivo temporal en disco: workbook.xlsx.readFile (ExcelJS) necesita una ruta, no un
// buffer en memoria. fileFilter descarta cualquier archivo que no sea .xlsx antes de
// escribirlo a disco — sin esto, se podía subir cualquier archivo al import de tasas.
// cb(null, false) hace que multer no adjunte el archivo (req.file queda undefined) en vez
// de lanzar un error crudo; el controller ya valida `!req.file` con un 400 explicativo.
const upload = multer({
  dest: 'uploads/',
  fileFilter(_req, file, cb) {
    const esXlsx = file.originalname.toLowerCase().endsWith('.xlsx') && file.mimetype === MIMETYPE_XLSX;
    cb(null, esXlsx);
  },
});

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
