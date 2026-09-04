import * as propuestasRepository from '../../repositories/propuestas.repository.js'
import { httpError } from '../../utils/http-error.js'
import { buildPropuestaFormalSnapshot, hashPdf } from '../document-snapshot.service.js'
import { renderPropuestaMrcPdf } from '../propuesta-pdf.service.js'

import { traducirErrorRpc } from './borradores.service.js'
import { asegurarCartaApta, motivoIneligibilidadCarta } from './elegibilidad.service.js'
import { asegurarReadinessEmision, MRC_REQUIRED_TEXT_KEYS } from './readiness.service.js'

function canDownload(usuario, propuesta) {
  return (
    usuario.rol === 'admin' ||
    usuario.puede_descargar_propuestas ||
    propuesta.cartas_oferta?.cotizaciones?.agente_id === usuario.id
  )
}

function commercialSelection(carta, propuesta) {
  const variantes = carta.snapshot_json?.cotizacion?.cotizacion_variantes ?? []
  const variante = variantes.find((item) => item.id === propuesta.cotizacion_variante_id)
  const planPago = variante?.cotizacion_plan_pago?.find(
    (item) => item.id === propuesta.cotizacion_plan_pago_id
  )
  if (!variante || !planPago) throw httpError(409, 'La selección comercial ya no es válida')
  return { variante, plan_pago: planPago }
}

export async function emitirPropuesta(id, { revision }, usuario) {
  const propuesta = await propuestasRepository.findPropuestaContextById(id)
  const carta = propuesta.cartas_oferta
  const motivo = await motivoIneligibilidadCarta(carta.id, usuario)
  asegurarCartaApta(motivo)
  const textos = await propuestasRepository.findPublishedTexts()
  const readiness = asegurarReadinessEmision({
    propuesta,
    carta,
    motivoIneligibilidad: motivo,
    textos,
  })
  if (['PF_TEXTOS_NO_PUBLICADOS', 'PF_TEXTOS_INCOMPLETOS'].includes(readiness.error)) {
    throw httpError(409, 'Faltan textos MRC oficiales publicados para emitir la Propuesta Formal')
  }
  if (readiness.error)
    throw httpError(422, 'Faltan datos obligatorios para emitir la Propuesta Formal')
  const document = buildPropuestaFormalSnapshot({
    propuesta,
    carta,
    commercial: commercialSelection(carta, propuesta),
    agente: usuario,
    textos,
  })

  let started
  try {
    started = await propuestasRepository.iniciarEmision({
      p_propuesta_id: id,
      p_revision_esperada: revision,
      p_snapshot_json: document.snapshot,
      p_snapshot_hash: document.snapshotHash,
      p_schema_version: document.schemaVersion,
      p_template_version: document.templateVersion,
      p_text_versions_json: document.textVersions,
      p_actor_id: usuario.id,
      p_es_admin: usuario.rol === 'admin',
    })
  } catch (error) {
    throw traducirErrorRpc(error)
  }

  if (started.snapshot_json?.proposal?.numero_propuesta !== started.numero_propuesta) {
    const finalDocument = buildPropuestaFormalSnapshot({
      propuesta: { ...propuesta, numero_propuesta: started.numero_propuesta },
      carta,
      commercial: commercialSelection(carta, propuesta),
      agente: usuario,
      textos,
    })
    try {
      started = await propuestasRepository.actualizarSnapshotEmision({
        p_propuesta_id: id,
        p_snapshot_json: finalDocument.snapshot,
        p_snapshot_hash: finalDocument.snapshotHash,
      })
    } catch (error) {
      await propuestasRepository
        .registrarErrorEmision({
          p_propuesta_id: id,
          p_error_codigo: error.code ?? 'snapshot_failed',
          p_actor_id: usuario.id,
        })
        .catch(() => {})
      throw traducirErrorRpc(error)
    }
  }

  const storagePath = `mrc/${started.numero_propuesta}.pdf`
  try {
    const pdf = await renderPropuestaMrcPdf(started.snapshot_json)
    await propuestasRepository.uploadProposalPdf(storagePath, pdf)
    try {
      return await propuestasRepository.confirmarEmision({
        p_propuesta_id: id,
        p_pdf_storage_path: storagePath,
        p_pdf_hash: hashPdf(pdf),
        p_pdf_size: pdf.length,
        p_actor_id: usuario.id,
      })
    } catch (error) {
      await propuestasRepository.removeProposalPdf(storagePath).catch(() => {})
      throw error
    }
  } catch (error) {
    await propuestasRepository
      .registrarErrorEmision({
        p_propuesta_id: id,
        p_error_codigo: error.code ?? 'pdf_generation_failed',
        p_actor_id: usuario.id,
      })
      .catch(() => {})
    throw traducirErrorRpc(error)
  }
}

export async function descargarPropuesta(id, usuario) {
  const propuesta = await propuestasRepository.findPropuestaContextById(id)
  if (!canDownload(usuario, propuesta))
    throw httpError(403, 'No tenés permiso para descargar esta Propuesta Formal')
  if (!['emitida', 'anulada'].includes(propuesta.estado) || !propuesta.pdf_storage_path) {
    throw httpError(409, 'La Propuesta Formal todavía no tiene un PDF emitido')
  }
  const pdf = await propuestasRepository.downloadProposalPdf(propuesta.pdf_storage_path)
  if (!propuesta.pdf_hash || hashPdf(pdf) !== propuesta.pdf_hash) {
    throw httpError(
      409,
      'El PDF almacenado de la Propuesta Formal no supera la verificación de integridad'
    )
  }
  return { pdf, propuesta }
}

export async function anularPropuesta(id, { motivo }, usuario) {
  const canAnnul = usuario.rol === 'admin' || usuario.puede_anular_propuestas
  if (!canAnnul) {
    throw httpError(403, 'No tenés permiso para anular esta Propuesta Formal')
  }
  try {
    return await propuestasRepository.anularPropuesta({
      p_propuesta_id: id,
      p_motivo: motivo,
      p_actor_id: usuario.id,
      p_autorizado: canAnnul,
    })
  } catch (error) {
    throw traducirErrorRpc(error)
  }
}

export async function listarTextos(usuario) {
  const textos = await propuestasRepository.findPublishedTexts()
  const clavesPublicadas = new Set(textos.map((texto) => texto.clave))
  const faltantes = MRC_REQUIRED_TEXT_KEYS.filter((clave) => !clavesPublicadas.has(clave))
  return {
    textos,
    puede_gestionar: usuario.rol === 'admin' || usuario.puede_gestionar_textos_propuesta,
    claves_requeridas: MRC_REQUIRED_TEXT_KEYS,
    faltantes,
    emision_habilitada: faltantes.length === 0,
  }
}

export async function publicarTexto(input, usuario) {
  if (!(usuario.rol === 'admin' || usuario.puede_gestionar_textos_propuesta)) {
    throw httpError(403, 'No tenés permiso para publicar textos de Propuesta Formal')
  }
  try {
    return await propuestasRepository.publishText({
      p_producto_codigo: 'mrc',
      p_clave: input.clave,
      p_contenido: input.contenido,
      p_motivo: input.motivo,
      p_actor_id: usuario.id,
    })
  } catch (error) {
    throw traducirErrorRpc(error)
  }
}
