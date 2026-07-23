import * as tasasService from '../services/tasas.service.js';
import { httpError } from '../utils/http-error.js';

export async function importar(req, res, next) {
  try {
    if (!req.file) {
      throw httpError(400, 'Falta el archivo .xlsx en el campo "archivo"');
    }
    const resumen = await tasasService.importarTasasAuto(req.file.path);
    res.json({ importado: resumen });
  } catch (err) {
    next(err);
  }
}
