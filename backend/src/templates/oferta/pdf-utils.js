import puppeteer from 'puppeteer';

// Instancia de browser compartida y reutilizada entre requests — lanzar un Chromium por
// PDF sería carísimo (Puppeteer tarda ~1s solo en levantar el proceso). Se lanza on-demand
// en el primer uso y queda viva mientras el server esté arriba. Vive acá (y no en
// services/pdf.service.js) porque measureContentHeightMm, que también la necesita, es una
// utilidad de armado de la Carta Oferta — services/pdf.service.js importa `getBrowser` desde
// este módulo para su propio renderHtmlToPdf, evitando que templates/ dependa de services/.
let browserPromise = null;

export function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    browserPromise
      .then((browser) => browser.once('disconnected', () => { browserPromise = null; }))
      .catch(() => { browserPromise = null; });
  }
  return browserPromise;
}

const PX_POR_MM = 96 / 25.4;

/**
 * Renderiza `bodyHtml` (con `cssText`, ej. BASE_CSS) en una página headless del ancho de hoja
 * dado y devuelve el alto renderizado en mm — usado para decidir si un layout de columnas
 * "forzado" (que no puede fragmentarse entre hojas, a diferencia de column-count) entra en una
 * sola página antes de generar el PDF final. No es una medida 100% exacta del motor de
 * impresión de Puppeteer (usa el viewport normal, no el modo "print"), pero alcanza como
 * chequeo conservador: si ya excede el alto útil en pantalla, seguro tampoco entra impreso.
 */
export async function measureContentHeightMm(bodyHtml, cssText, widthMm = 215.9) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: Math.ceil(widthMm * PX_POR_MM), height: 200 });
    await page.setContent(
      `<!doctype html><html><head><style>${cssText}</style></head><body><div class="page"><div class="body">${bodyHtml}</div></div></body></html>`,
      { waitUntil: 'networkidle0' }
    );
    const heightPx = await page.evaluate(() => document.querySelector('.body').scrollHeight);
    return heightPx / PX_POR_MM;
  } finally {
    await page.close();
  }
}
