import * as cartasOfertaRepository from '../repositories/cartas-oferta.repository.js'
import { ofertaDisponibleParaRamo } from '../templates/oferta/index.js'
import { httpError } from '../utils/http-error.js'

import {
  buildCartaOfertaSnapshot,
  buildCartaOfertaRenderInput,
  buildCotizacionFuenteSnapshot,
  hashPdf,
} from './document-snapshot.service.js'
import { renderOfertaPdf } from './pdf.service.js'

export async function generarCartaOfertaPersistida({
  cotizacion,
  plan,
  ramo,
  planCoberturas,
  usuario,
}) {
  if (!ofertaDisponibleParaRamo(ramo)) {
    throw httpError(
      422,
      `Carta Oferta no implementada todavía para el ramo "${ramo.nombre}".`,
      `La Carta Oferta de ${ramo.nombre_display ?? ramo.nombre} todavía no está disponible.`
    )
  }

  const document = buildCartaOfertaSnapshot({ cotizacion, plan, ramo, planCoberturas })
  const carta = await cartasOfertaRepository.iniciarCartaOfertaGeneracion({
    p_cotizacion_id: cotizacion.id,
    p_producto_codigo: document.snapshot.product_code,
    p_snapshot_json: document.snapshot,
    p_snapshot_hash: document.snapshotHash,
    p_schema_version: document.schemaVersion,
    p_template_version: document.templateVersion,
    p_calculator_version: document.calculatorVersion,
    p_generada_por: usuario.id,
    p_cotizacion_fuente: buildCotizacionFuenteSnapshot(cotizacion, { plan, ramo, planCoberturas }),
  })

  if (!carta) throw new Error('La generación de Carta Oferta no devolvió un estado documental')
  if (!carta.snapshot_vigente) throw snapshotObsoletoError()

  const storagePath = carta.pdf_storage_path ?? `${cotizacion.id}/v${carta.version}.pdf`
  if (!carta.puede_generar) {
    if (carta.estado === 'emitida') {
      const pdf = await cartasOfertaRepository.descargarPdfCartaOferta(storagePath)
      if (!carta.pdf_hash || hashPdf(pdf) !== carta.pdf_hash) {
        throw httpError(
          409,
          'El PDF almacenado de la Carta Oferta no supera la verificación de integridad'
        )
      }
      return pdf
    }
    throw httpError(409, 'La Carta Oferta ya está siendo generada')
  }

  try {
    if (!carta.snapshot_json) {
      throw new Error('La generación de Carta Oferta no devolvió el snapshot canónico persistido')
    }
    const pdf = await renderOfertaPdf(buildCartaOfertaRenderInput(carta.snapshot_json))
    const pdfHash = hashPdf(pdf)

    await cartasOfertaRepository.subirPdfCartaOferta(storagePath, pdf)
    try {
      const emitida = await cartasOfertaRepository.emitirCartaOferta({
        p_carta_id: carta.id,
        p_pdf_storage_path: storagePath,
        p_pdf_hash: pdfHash,
        p_pdf_size: pdf.length,
      })
      if (!emitida) throw snapshotObsoletoError()
    } catch (error) {
      try {
        await cartasOfertaRepository.eliminarPdfCartaOferta(storagePath)
      } catch {
        // The document remains non-issued and can be recovered by the retry workflow.
      }
      throw error
    }
    return pdf
  } catch (error) {
    try {
      await cartasOfertaRepository.registrarErrorCartaOferta({
        p_carta_id: carta.id,
        p_error_codigo: error.code ?? 'pdf_generation_failed',
      })
    } catch {
      // The original rendering/storage error is the actionable error for the caller.
    }
    throw error
  }
}

function snapshotObsoletoError() {
  const error = httpError(
    409,
    'La cotización fue recotizada durante la generación de la Carta Oferta'
  )
  error.code = 'CARTA_OFERTA_SNAPSHOT_OBSOLETO'
  return error
}
