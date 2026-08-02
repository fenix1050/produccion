import { createApp } from './app.js'
import { closeBrowser } from './templates/oferta/pdf-utils.js'

const app = createApp()
const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log(`Cotizador Tajy API escuchando en http://localhost:${port}`)
})

async function shutdown(signal) {
  console.log(`[server] ${signal} recibido, cerrando Puppeteer antes de salir`)
  await closeBrowser()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
