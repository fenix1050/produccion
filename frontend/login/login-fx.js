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
  } = options;

  const ctx = canvas.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  let width = 0;
  let height = 0;
  let particles = [];
  let mouse = { x: -9999, y: -9999, active: false };
  let rafId = 0;

  function resize() {
    const rect = boundsEl.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = width * DPR;
    canvas.height = height * DPR;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function seed() {
    particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: 1 + Math.random() * 1.6,
    }));
  }

  function onPointerMove(e) {
    const rect = boundsEl.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.active = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
  }

  function onPointerLeave() {
    mouse.active = false;
  }

  function step() {
    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
      if (mouse.active) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < mouseRadius && dist > 0.001) {
          const force = (1 - dist / mouseRadius) * 0.6;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
      }

      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;

      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;
      p.x = Math.max(0, Math.min(width, p.x));
      p.y = Math.max(0, Math.min(height, p.y));
    }

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < linkDistance) {
          ctx.strokeStyle = `rgba(${particleColor}, ${linkAlpha * (1 - dist / linkDistance)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${particleColor}, ${particleAlpha})`;
      ctx.fill();
    }

    rafId = requestAnimationFrame(step);
  }

  resize();
  seed();
  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseleave', onPointerLeave);
  rafId = requestAnimationFrame(step);

  return function destroy() {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseleave', onPointerLeave);
  };
}