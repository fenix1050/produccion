import * as tasasService from '../services/tasas.service.js';

export async function importar(req, res, next) {
  try {
    if (!req.file) {
      const err = new Error('Falta el archivo .xlsx en el campo "archivo"');
      err.status = 400;
      throw err;
    }
    const resumen = await tasasService.importarTasasAuto(req.file.path);
    res.json({ importado: resumen });
  } catch (err) {
    next(err);
  }
}
