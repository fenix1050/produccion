import { Router } from 'express'
import multer from 'multer'

import * as tasasController from '../controllers/tasas.controller.js'
import { requireRole, requireTasasEdit } from '../middleware/auth.js'
import { httpError } from '../utils/http-error.js'

const MIMETYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Archivo temporal en disco: workbook.xlsx.readFile (ExcelJS) necesita una ruta, no un
// buffer en memoria. fileFilter descarta cualquier archivo que no sea .xlsx antes de
// escribirlo a disco — sin esto, se podía subir cualquier archivo al import de tasas.
// cb(null, false) hace que multer no adjunte el archivo (req.file queda undefined) en vez
// de lanzar un error crudo; el controller ya valida `!req.file` con un 400 explicativo.
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB: ninguna planilla real de tasas se acerca a este tamaño
  fileFilter(_req, file, cb) {
    const esXlsx =
      file.originalname.toLowerCase().endsWith('.xlsx') && file.mimetype === MIMETYPE_XLSX
    cb(null, esXlsx)
  },
})

export const router = Router()

// requireAuth ya corre en routes/index.js antes de llegar acá; sumamos el gate de rol +
// permiso específico de edición de tasas.
router.post(
  '/importar',
  requireRole('admin'),
  requireTasasEdit,
  (req, res, next) => {
    upload.single('archivo')(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(httpError(400, 'El archivo supera el tamaño máximo permitido (10MB)'))
      }
      next(err)
    })
  },
  tasasController.importar
)
