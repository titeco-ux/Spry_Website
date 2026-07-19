import { animate, stagger, createAnimatable, svg } from 'https://cdn.jsdelivr.net/npm/animejs@4/+esm';

// --- DOM Elements ---
const phaseList = document.getElementById('phase-list');
const ringsSvg = document.querySelector('.rings-svg');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Config ---
const MAX_TILT = 16.8; // degrees the disc field leans toward the cursor (+5%)

// Reveal phase rows one-by-one as they enter the viewport.
function initPhaseReveal() {
  if (!phaseList) return;
  const rows = Array.from(phaseList.querySelectorAll('.phase'));

  if (!('IntersectionObserver' in window)) {
    rows.forEach((row) => row.classList.add('in'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const row = entry.target;
        const index = rows.indexOf(row);
        row.style.transitionDelay = `${Math.min(index, 8) * 60}ms`;
        row.classList.add('in');
        observer.unobserve(row);
      });
    },
    { threshold: 0.2 }
  );

  rows.forEach((row) => observer.observe(row));
}

// Pulsing background: halo breathes, ring field shimmers, ripples emit outward.
function initPulseBackground() {
  if (prefersReducedMotion) return; // leave the static ring field in place

  // Disc field — staggered pulse; opacity pulse makes the stacked
  // center breathe darker/lighter (each disc offset from the last)
  animate('.pulse-ring', {
    scale: [0.98, 1.04],
    opacity: [0.6, 1],
    ease: 'inOutSine',
    duration: 3600,
    loop: true,
    alternate: true,
    delay: stagger(240),
  });
}

// Tilt the disc field toward the cursor. createAnimatable eases each axis
// smoothly toward the latest target instead of snapping on every mousemove.
function initCursorTilt() {
  if (prefersReducedMotion || !ringsSvg) return;
  if (window.matchMedia('(pointer: coarse)').matches) return; // skip touch devices

  const tilt = createAnimatable(ringsSvg, {
    rotateX: 700,
    rotateY: 700,
    ease: 'out(3)',
  });

  window.addEventListener('mousemove', (e) => {
    const dx = (e.clientX / window.innerWidth) * 2 - 1;  // -1 .. 1
    const dy = (e.clientY / window.innerHeight) * 2 - 1; // -1 .. 1
    tilt.rotateY(dx * MAX_TILT);
    tilt.rotateX(-dy * MAX_TILT);
  });

  // ease back to flat when the cursor leaves the window
  window.addEventListener('mouseleave', () => {
    tilt.rotateX(0);
    tilt.rotateY(0);
  });
}

// Stacking panels (What we do): the active panel is the last one whose header
// has reached its pinned position. Previous panels get a deactivated heading.
function initStack(section, anim, panels) {
  const headH = parseInt(getComputedStyle(section).getPropertyValue('--head-h'), 10) || 80;
  let raf = 0;
  function update() {
    raf = 0;
    let active = 0;
    panels.forEach((p, i) => {
      if (p.getBoundingClientRect().top <= i * headH + 1) active = i;
    });
    if (anim) anim.setAttribute('data-active', String(active));
    panels.forEach((p, i) => p.classList.toggle('is-stacked', i < active));
  }
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
}

// For each .wwd section: stacking panels use scroll tracking; simpler cell
// layouts (methodology) swap the sticky icon as each cell crosses the middle.
function initWwdAnim() {
  document.querySelectorAll('.wwd').forEach((section) => {
    const anim = section.querySelector('.wwd-anim');
    const panels = Array.from(section.querySelectorAll('.wwd-panel'));

    if (panels.length) {
      initStack(section, anim, panels);
      return;
    }
    if (!anim || !('IntersectionObserver' in window)) return;
    const cards = Array.from(section.querySelectorAll('[data-card]'));
    if (!cards.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            anim.setAttribute('data-active', entry.target.getAttribute('data-card'));
          }
        });
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
    );
    cards.forEach((card) => observer.observe(card));
  });
}

// Dotted mesh behind each sticky icon: staggered (hex-ish) dot grid that
// ripples in a wave, driven by anime.js grid stagger.
// Dotted mesh: dots hold their grid, gently ripple (wave), and — only within a
// radius of the cursor — lean toward it (falloff with distance), so the grid
// isn't shifted as a block; just the dots near the pointer follow it.
function initWwdMesh() {
  const PAD = 60;       // dots extend beyond the column (clipped by overflow)
  const RADIUS = 160;   // dots within this distance of the cursor react
  const STRENGTH = 24;  // max px a dot is pulled toward the cursor

  document.querySelectorAll('.wwd-sticky').forEach((col) => {
    const rect = col.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const s = 54;           // horizontal spacing
    const h = s * 0.87;     // row height (hexagonal packing)
    const cols = Math.ceil((rect.width + PAD * 2) / s) + 1;
    const rows = Math.ceil((rect.height + PAD * 2) / h) + 1;
    const midX = (cols * s) / 2;
    const midY = (rows * h) / 2;

    const mesh = document.createElement('div');
    mesh.className = 'wwd-mesh';
    const dots = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const bx = c * s + (r % 2 ? s / 2 : 0);
        const by = r * h;
        const el = document.createElement('span');
        el.className = 'wwd-dot';
        el.style.left = `${bx}px`;
        el.style.top = `${by}px`;
        mesh.appendChild(el);
        dots.push({ el, bx, by, dc: Math.hypot(bx - midX, by - midY), tx: 0, ty: 0 });
      }
    }
    col.prepend(mesh);
    if (prefersReducedMotion) return;

    const coarse = window.matchMedia('(pointer: coarse)').matches;
    let cursor = null; // in mesh-local coords
    if (!coarse) {
      col.addEventListener('mousemove', (e) => {
        const b = mesh.getBoundingClientRect();
        cursor = { x: e.clientX - b.left, y: e.clientY - b.top };
      });
      col.addEventListener('mouseleave', () => { cursor = null; });
    }

    let visible = true;
    let raf = 0;
    let t0 = 0;

    function frame(t) {
      if (!t0) t0 = t;
      const time = t - t0;
      for (const d of dots) {
        const scale = 1 + 0.32 * Math.sin(time / 650 - d.dc / 55); // ripple wave
        let goalX = 0, goalY = 0;
        if (cursor) {
          const dx = cursor.x - d.bx, dy = cursor.y - d.by;
          const dist = Math.hypot(dx, dy);
          if (dist < RADIUS && dist > 0.01) {
            const pull = (1 - dist / RADIUS) * STRENGTH;
            goalX = (dx / dist) * pull;
            goalY = (dy / dist) * pull;
          }
        }
        d.tx += (goalX - d.tx) * 0.15; // ease toward target
        d.ty += (goalY - d.ty) * 0.15;
        d.el.style.transform =
          `translate(${d.tx.toFixed(2)}px, ${d.ty.toFixed(2)}px) scale(${scale.toFixed(3)})`;
      }
      raf = visible ? requestAnimationFrame(frame) : 0;
    }
    const start = () => { if (!raf) raf = requestAnimationFrame(frame); };

    if ('IntersectionObserver' in window) {
      visible = false;
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible) start();
      }, { threshold: 0 }).observe(col);
    } else {
      start();
    }
  });
}

// Each flat icon: a static deactivated-colour clone (the "mark") sits behind an
// orange copy that self-draws over it via anime.js createDrawable.
function initWwdIcons() {
  const NS = 'http://www.w3.org/2000/svg';
  document.querySelectorAll('.wwd-ico').forEach((ico) => {
    const shapes = Array.from(ico.children);
    const track = document.createElementNS(NS, 'g');
    track.setAttribute('class', 'wwd-track');
    shapes.forEach((sh) => track.appendChild(sh.cloneNode(true)));
    ico.insertBefore(track, ico.firstChild); // behind the originals
    shapes.forEach((sh) => sh.classList.add('wwd-draw'));
  });

  if (prefersReducedMotion) return;
  const drawables = svg.createDrawable('.wwd-draw');
  if (!drawables.length) return;
  animate(drawables, {
    draw: ['0 0', '0 1'],
    ease: 'inOutSine',
    duration: 1050,
    delay: stagger(80),
    loop: true,
    alternate: true,
  });
}

// Oscillating traveling waves in the methodology right div (div 7).
// One bold main line through the middle + thinner lines above and below.
// The waveform travels left -> right; amplitude breathes ("oscillates").
function initMethodWave() {
  const canvas = document.getElementById('method-wave');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const mount = canvas.parentElement;

  // Read brand colors from CSS custom properties.
  const css = getComputedStyle(document.documentElement);
  const ink = (css.getPropertyValue('--color-ink') || '#0a0a0a').trim();
  const accent = (css.getPropertyValue('--color-accent') || '#ff3d00').trim();

  // Line config: main = bold accent line in the middle;
  // the rest are thinner ink lines fanning out above and below.
  const LINES = [
    { offset: -0.30, amp: 0.06, width: 0.5,  color: ink,    alpha: 0.28, speed: 1.0 },
    { offset: -0.16, amp: 0.10, width: 0.75, color: ink,    alpha: 0.45, speed: 1.0 },
    { offset:  0.00, amp: 0.20, width: 16,   color: accent, alpha: 1.00, speed: 1.0, fillMesh: true }, // main line
    { offset:  0.16, amp: 0.10, width: 0.75, color: ink,    alpha: 0.45, speed: 1.0, fillDown: true },
    { offset:  0.30, amp: 0.06, width: 0.5,  color: ink,    alpha: 0.28, speed: 1.0, fillDown: true },
  ];
  // orange mesh fill spans the band between the orange wave and the wave below it
  LINES[2].bandBelow = LINES[3];

  // Dotted hex-ish mesh, baked into an offscreen tile -> repeating pattern.
  const makeDotPattern = () => {
    const cw = 24, ch = 42; // 24 × ~24·√3 → hexagonal spacing
    const tile = document.createElement('canvas');
    tile.width = cw; tile.height = ch;
    const tc = tile.getContext('2d');
    tc.fillStyle = 'rgba(255,255,255,0.9)';   // white dots
    const dot = (x, y) => { tc.beginPath(); tc.arc(x, y, 1.2, 0, Math.PI * 2); tc.fill(); };
    // lattice A (corners) + lattice B (offset by half-cell) = hex lattice
    dot(0, 0); dot(cw, 0); dot(0, ch); dot(cw, ch);
    dot(cw / 2, ch / 2);
    return ctx.createPattern(tile, 'repeat');
  };
  const dotPattern = makeDotPattern();

  let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    w = mount.clientWidth;
    h = mount.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  // Reduced motion: draw one static frame and stop.
  const drawFrame = (t) => {
    if (!w || !h) { resize(); return; }
    ctx.clearRect(0, 0, w, h);
    const midY = h / 2;
    const time = t * 0.001;
    const k = (Math.PI * 2) / (w * 0.55);   // wave length (same for all lines)

    // y of a given line's wave at horizontal position x
    const waveY = (line, x) => {
      const breathe = 0.75 + 0.25 * Math.sin(time * 0.8 + line.offset * 6);
      const amp = h * line.amp * breathe;
      const baseY = midY + h * line.offset;
      const phase = time * line.speed * 2.2; // travels left -> right
      return baseY + Math.sin(x * k - phase) * amp;
    };

    for (const line of LINES) {
      // band fill between the orange wave (top) and the wave below it (bottom)
      if (line.bandBelow) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 4) {
          const y = waveY(line, x);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        for (let x = w; x >= 0; x -= 4) ctx.lineTo(x, waveY(line.bandBelow, x));
        ctx.closePath();
        ctx.globalAlpha = 1;
        ctx.fillStyle = line.color;   // orange backing
        ctx.fill();
        if (line.fillMesh) {
          ctx.fillStyle = dotPattern; // white dot mesh on top
          ctx.fill();
        }
      }

      // fill the area from the wave down to the bottom border (40% opacity)
      if (line.fillDown) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 4) {
          const y = waveY(line, x);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = line.color;
        ctx.fill();
      }

      // the wave line itself
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = waveY(line, x);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.globalAlpha = line.alpha;
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.width;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  if (prefersReducedMotion) {
    drawFrame(0);
    return;
  }

  let raf;
  const loop = (t) => { drawFrame(t); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
}

// --- Init ---
function init() {
  initPhaseReveal();
  initPulseBackground();
  initCursorTilt();
  initWwdAnim();
  initWwdMesh();
  initWwdIcons();
  initMethodWave();
}

document.addEventListener('DOMContentLoaded', init);
