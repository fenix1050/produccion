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
 * buffer PDF en A4.
 */
export async function renderHtmlToPdf(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    // page.pdf() devuelve un Uint8Array, no un Buffer de Node — res.send() lo serializa mal
    // como JSON ({"0":37,"1":80,...}) si no se envuelve acá.
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
