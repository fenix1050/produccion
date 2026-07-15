import puppeteer from 'puppeteer';

// Instancia de browser compartida y reutilizada entre requests — lanzar un Chromium por
// PDF sería carísimo (Puppeteer tarda ~1s solo en levantar el proceso). Se lanza on-demand
// en el primer PDF pedido y queda viva mientras el server esté arriba.
let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  }
  return browserPromise;
}

/**
 * Renderiza un string HTML autocontenido (CSS inline/embebido, sin requests externos) a un
 * buffer PDF en A4. `headerTemplate`/`footerTemplate` (HTML de Puppeteer, contexto aislado sin
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
      format: 'A4',
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
