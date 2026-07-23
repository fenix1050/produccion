// El singleton del browser de Puppeteer vive en templates/oferta/pdf-utils.js (lo comparte
// con measureContentHeightMm) para que no haya dos instancias de Chromium compitiendo ni una
// dependencia cruzada entre templates/ y services/ — ver ese archivo para el detalle.
import { getBrowser } from '../templates/oferta/pdf-utils.js';

/**
 * Renderiza un string HTML autocontenido (CSS inline/embebido, sin requests externos) a un
 * buffer PDF en tamaño Oficio. `format: 'Legal'` (8.5"x14" = 215.9mm x 355.6mm) porque esa es
 * la medida real que reportan los drivers de impresora para "Oficio" en Paraguay — confirmado
 * contra `System.Drawing.Printing.PrinterSettings` de una impresora física (Kind=Legal), no un
 * estándar ISO. `headerTemplate`/`footerTemplate` (HTML de Puppeteer, contexto aislado sin
 * acceso al CSS del documento) se repiten en CADA hoja física del PDF — a diferencia de dibujar
 * header/footer dentro del HTML de la página, que solo aparece una vez por página lógica y deja
 * sin marca las hojas de overflow cuando el contenido no entra en una sola hoja.
 */
export async function renderHtmlToPdf(html, { headerTemplate, footerTemplate, margin } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'Legal',
      printBackground: true,
      margin: margin ?? { top: '0', bottom: '0', left: '0', right: '0' },
      displayHeaderFooter: Boolean(headerTemplate || footerTemplate),
      headerTemplate: headerTemplate ?? '<span></span>',
      footerTemplate: footerTemplate ?? '<span></span>',
    });
    // page.pdf() devuelve un Uint8Array, no un Buffer de Node — res.send() lo serializa mal
    // como JSON ({"0":37,"1":80,...}) si no se envuelve acá.
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
