// Punto con halo neón, pre-renderizado UNA vez en un canvas fuera de pantalla.
//
// Lo obvio para lograr el halo es ctx.shadowBlur, y es una trampa: recalcula un
// desenfoque gaussiano por cada trazo y por cada frame. Medido en esta misma
// pantalla a 1920x1080, hunde el login de 60 fps a 21 (-65%). Estampar un sprite
// ya calculado con drawImage cuesta prácticamente lo mismo que dibujar el punto
// pelado, porque el degradado se calcula una sola vez en la vida.
//
// El sprite se dibuja con un núcleo de referencia de 16px y después se escala al
// radio de cada partícula, así una sola textura sirve para todos los tamaños.
const NUCLEO_SPRITE = 16

function crearSpriteGlow(color, alphaNucleo, difuminado) {
  const radio = NUCLEO_SPRITE + difuminado
  const sprite = document.createElement('canvas')
  sprite.width = radio * 2
  sprite.height = radio * 2

  const sctx = sprite.getContext('2d')
  const degradado = sctx.createRadialGradient(radio, radio, 0, radio, radio, radio)
  const borde = NUCLEO_SPRITE / radio

  degradado.addColorStop(0, `rgba(${color}, ${alphaNucleo})`)
  degradado.addColorStop(borde * 0.6, `rgba(${color}, ${alphaNucleo * 0.62})`)
  degradado.addColorStop(borde, `rgba(${color}, ${alphaNucleo * 0.24})`)
  degradado.addColorStop(1, `rgba(${color}, 0)`)

  sctx.fillStyle = degradado
  sctx.fillRect(0, 0, radio * 2, radio * 2)

  return { canvas: sprite, radio }
}

function estampar(ctx, sprite, x, y, r) {
  const d = (sprite.radio * r) / NUCLEO_SPRITE
  ctx.drawImage(sprite.canvas, x - d, y - d, d * 2, d * 2)
}

// Gemelo en datos de frontend/shared/assets/constellation-red.svg: mismos nodos,
// mismas aristas y mismos radios/opacidades, en las unidades de su viewBox
// (720x520). El SVG sigue existiendo y se usa tal cual en el resto de la app; acá
// necesitamos las coordenadas sueltas para poder animar cada nodo por separado.
// SI SE EDITA EL SVG, HAY QUE ACTUALIZAR ESTO.
const CONSTELLATION_VIEWBOX = { width: 720, height: 520 }

const CONSTELLATION_NODES = [
  { x: 76, y: 338, r: 4.2, alpha: 0.58 },
  { x: 187, y: 248, r: 3.2, alpha: 0.5 },
  { x: 221, y: 384, r: 2.7, alpha: 0.4 },
  { x: 299, y: 302, r: 3.8, alpha: 0.55 },
  { x: 363, y: 441, r: 2.5, alpha: 0.32 },
  { x: 394, y: 180, r: 3.5, alpha: 0.48 },
  { x: 507, y: 380, r: 2.9, alpha: 0.38 },
  { x: 531, y: 232, r: 4.1, alpha: 0.57 },
  // Vértice sin círculo en el SVG: cierra una arista pero no se dibuja.
  { x: 633, y: 136, r: 0, alpha: 0 },
  { x: 633, y: 276, r: 2.6, alpha: 0.34 },
  { x: 633, y: 424, r: 2.1, alpha: 0.24 },
]

const CONSTELLATION_EDGES = [
  [0, 1],
  [1, 3],
  [3, 5],
  [5, 7],
  [7, 8],
  [1, 2],
  [2, 4],
  [4, 7],
  [3, 4],
  [4, 6],
  [6, 10],
  [0, 2],
  [2, 3],
  [3, 6],
  [6, 7],
]

// Constelación animada. Cada nodo describe una órbita lenta de Lissajous
// alrededor de su posición de diseño, con amplitud acotada: la figura respira
// pero nunca se deforma ni se desarma, que es lo que pasaría si se los soltara
// a derivar libremente como a las partículas del fondo.
export function initConstellationFx(canvas, options = {}) {
  const {
    color = '255, 42, 61',
    lineAlpha = 0.22,
    lineWidth = 1.2,
    mouseRadius = 170,
    amplitude = 13,
    glow = 0,
    glowAlpha = 0.85,
  } = options

  const ctx = canvas.getContext('2d')
  const sprite = glow ? crearSpriteGlow(color, 1, glow) : null

  let width = 0
  let height = 0
  let escala = 1
  let rafId = 0
  let mouse = { x: -9999, y: -9999, active: false }

  const nodos = CONSTELLATION_NODES.map((nodo) => ({
    ...nodo,
    // Cada nodo con su fase y frecuencia propias: si compartieran una sola, la
    // red entera latiría en bloque y se leería como un único objeto moviéndose.
    faseX: Math.random() * Math.PI * 2,
    faseY: Math.random() * Math.PI * 2,
    frecX: 0.14 + Math.random() * 0.22,
    frecY: 0.12 + Math.random() * 0.2,
    amp: amplitude * (0.6 + Math.random() * 0.7),
    // Desplazamiento del mouse, amortiguado hasta volver a la órbita.
    empujeX: 0,
    empujeY: 0,
  }))

  function resize() {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = rect.width
    height = rect.height
    escala = width / CONSTELLATION_VIEWBOX.width
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect()
    mouse.x = e.clientX - rect.left
    mouse.y = e.clientY - rect.top
    mouse.active =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
  }

  function onPointerLeave() {
    mouse.active = false
  }

  function posicion(nodo, t) {
    return {
      x: (nodo.x + Math.sin(t * nodo.frecX + nodo.faseX) * nodo.amp) * escala + nodo.empujeX,
      y: (nodo.y + Math.cos(t * nodo.frecY + nodo.faseY) * nodo.amp * 0.8) * escala + nodo.empujeY,
    }
  }

  function step(now) {
    const t = now / 1000
    ctx.clearRect(0, 0, width, height)

    const puntos = nodos.map((nodo) => {
      const p = posicion(nodo, t)

      if (mouse.active) {
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const dist = Math.hypot(dx, dy)
        if (dist < mouseRadius && dist > 0.001) {
          const fuerza = (1 - dist / mouseRadius) * 2.4
          nodo.empujeX += (dx / dist) * fuerza
          nodo.empujeY += (dy / dist) * fuerza
        }
      }

      nodo.empujeX *= 0.93
      nodo.empujeY *= 0.93

      return p
    })

    ctx.beginPath()
    for (const [a, b] of CONSTELLATION_EDGES) {
      ctx.moveTo(puntos[a].x, puntos[a].y)
      ctx.lineTo(puntos[b].x, puntos[b].y)
    }

    // El resplandor de las líneas es una segunda pasada gruesa y tenue debajo de
    // la línea nítida — mismo efecto que un desenfoque, a costo de un stroke.
    if (glow) {
      ctx.strokeStyle = `rgba(${color}, ${lineAlpha * 0.4})`
      ctx.lineWidth = lineWidth * 3.5
      ctx.stroke()
    }

    ctx.strokeStyle = `rgba(${color}, ${lineAlpha})`
    ctx.lineWidth = lineWidth
    ctx.stroke()

    nodos.forEach((nodo, i) => {
      if (!nodo.r) return

      if (sprite) {
        // El sprite se genera con alpha 1 y la opacidad propia de cada nodo se
        // aplica acá: así una sola textura cubre los 10 niveles del diseño.
        ctx.globalAlpha = nodo.alpha * glowAlpha
        estampar(ctx, sprite, puntos[i].x, puntos[i].y, nodo.r * escala)
        ctx.globalAlpha = 1
        return
      }

      ctx.beginPath()
      ctx.arc(puntos[i].x, puntos[i].y, nodo.r * escala, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${color}, ${nodo.alpha})`
      ctx.fill()
    })

    rafId = requestAnimationFrame(step)
  }

  resize()
  window.addEventListener('resize', resize)

  // Con movimiento reducido dibujamos un frame y paramos: antes esto era un
  // <img> estático, así que no animarlo tiene que dejar la constelación visible,
  // no hacerla desaparecer.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    step(0)
    cancelAnimationFrame(rafId)
    return function destroy() {
      window.removeEventListener('resize', resize)
    }
  }

  window.addEventListener('mousemove', onPointerMove)
  window.addEventListener('mouseleave', onPointerLeave)
  rafId = requestAnimationFrame(step)

  return function destroy() {
    cancelAnimationFrame(rafId)
    window.removeEventListener('resize', resize)
    window.removeEventListener('mousemove', onPointerMove)
    window.removeEventListener('mouseleave', onPointerLeave)
  }
}

// Prototipo — efecto de partículas reactivas al mouse para el login. Motor
// genérico en canvas 2D (sin WebGL): se instancia una vez para la franja
// diagonal (partículas blancas) y una vez para el fondo blanco (partículas
// rojas), compartiendo la misma posición de mouse global.
export function initLoginFx(canvas, boundsEl, options = {}) {
  const {
    particleCount = 46,
    linkDistance = 120,
    mouseRadius = 160,
    particleColor = '255, 255, 255',
    particleAlpha = 0.55,
    linkAlpha = 0.14,
    glow = 0,
    glowAlpha = 0.8,
  } = options

  const ctx = canvas.getContext('2d')
  const sprite = glow ? crearSpriteGlow(particleColor, 1, glow) : null

  let dpr = 1
  let width = 0
  let height = 0
  let particles = []
  let mouse = { x: -9999, y: -9999, active: false }
  let rafId = 0
  let removeResolutionListener = () => {}

  function resize() {
    const rect = boundsEl.getBoundingClientRect()
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = rect.width
    height = rect.height
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function watchResolution() {
    removeResolutionListener()
    const resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    const onChange = () => {
      resize()
      watchResolution()
    }

    resolution.addEventListener('change', onChange, { once: true })
    removeResolutionListener = () => resolution.removeEventListener('change', onChange)
  }

  function seed() {
    particles = Array.from({ length: particleCount }, () => {
      const angulo = Math.random() * Math.PI * 2
      const velocidad = 0.06 + Math.random() * 0.16

      return {
        x: Math.random() * width,
        y: Math.random() * height,
        // La deriva (dx, dy) es constante y nunca se amortigua: es lo único que
        // mantiene vivo el campo. El impulso del mouse (vx, vy) va aparte y sí
        // se amortigua, para que el empujón se disuelva y la partícula vuelva a
        // su deriva. Amortiguar la velocidad total dejaba todo el fondo
        // congelado a los ~2s de cargar, salvo alrededor del cursor.
        dx: Math.cos(angulo) * velocidad,
        dy: Math.sin(angulo) * velocidad,
        vx: 0,
        vy: 0,
        r: 1 + Math.random() * 1.6,
      }
    })
  }

  function onPointerMove(e) {
    const rect = boundsEl.getBoundingClientRect()
    mouse.x = e.clientX - rect.left
    mouse.y = e.clientY - rect.top
    mouse.active =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
  }

  function onPointerLeave() {
    mouse.active = false
  }

  function step() {
    ctx.clearRect(0, 0, width, height)

    for (const p of particles) {
      if (mouse.active) {
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const dist = Math.hypot(dx, dy)
        if (dist < mouseRadius && dist > 0.001) {
          const force = (1 - dist / mouseRadius) * 0.6
          p.vx += (dx / dist) * force
          p.vy += (dy / dist) * force
        }
      }

      p.x += p.dx + p.vx
      p.y += p.dy + p.vy
      p.vx *= 0.96
      p.vy *= 0.96

      if (p.x < 0 || p.x > width) {
        p.dx *= -1
        p.vx *= -1
      }
      if (p.y < 0 || p.y > height) {
        p.dy *= -1
        p.vy *= -1
      }
      p.x = Math.max(0, Math.min(width, p.x))
      p.y = Math.max(0, Math.min(height, p.y))
    }

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i]
        const b = particles[j]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (dist < linkDistance) {
          ctx.strokeStyle = `rgba(${particleColor}, ${linkAlpha * (1 - dist / linkDistance)})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }
    }

    if (sprite) {
      ctx.globalAlpha = particleAlpha * glowAlpha
      for (const p of particles) {
        estampar(ctx, sprite, p.x, p.y, p.r)
      }
      ctx.globalAlpha = 1
    } else {
      ctx.fillStyle = `rgba(${particleColor}, ${particleAlpha})`
      for (const p of particles) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    rafId = requestAnimationFrame(step)
  }

  resize()
  seed()
  watchResolution()
  window.addEventListener('resize', resize)
  window.addEventListener('mousemove', onPointerMove)
  window.addEventListener('mouseleave', onPointerLeave)
  rafId = requestAnimationFrame(step)

  return function destroy() {
    cancelAnimationFrame(rafId)
    window.removeEventListener('resize', resize)
    window.removeEventListener('mousemove', onPointerMove)
    window.removeEventListener('mouseleave', onPointerLeave)
    removeResolutionListener()
  }
}
