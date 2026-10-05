import { z } from 'zod'

// Largos máximos de los strings que llegan en una cotización. Sin tope, un nombre de 1 MB
// reventaba la columna (`22001` -> 500) y una dirección de 200 KB hacía tardar 22 s al PDF.
export const LIMITE_NOMBRE = 200
export const LIMITE_CONTACTO = 200
export const LIMITE_DIRECCION = 500
export const LIMITE_CEDULA = 50
export const LIMITE_CIUDAD = 100
export const LIMITE_RUBRO = 200
export const LIMITE_DESCRIPCION_AJUSTE = 200

// String con tope de largo y mensaje en español que nombra el campo en términos humanos (el 400 de
// validación lo devuelve tal cual al usuario). `sujeto` lleva el artículo: "El nombre del cliente".
export const textoMax = (limite, sujeto) =>
  z.string().max(limite, { message: `${sujeto} admite como máximo ${limite} caracteres.` })
