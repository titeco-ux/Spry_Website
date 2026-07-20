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
  const line = '#ffffff'; // wave lines: white so they contrast against the black backdrop

  // Line config: main = bold accent line in the middle;
  // the rest are thinner white lines fanning out above and below.
  const LINES = [
    { offset: -0.30, amp: 0.06, width: 0.5,  color: line,   alpha: 0.28, speed: 1.0 },
    { offset: -0.16, amp: 0.10, width: 0.75, color: line,   alpha: 0.45, speed: 1.0 },
    { offset:  0.00, amp: 0.12, width: 0,    color: accent, alpha: 0.60, speed: 1.0, fillMesh: true }, // main line (no thick border)
    { offset:  0.16, amp: 0.10, width: 0.75, color: line,   alpha: 0.45, speed: 1.0 },
    { offset:  0.30, amp: 0.06, width: 0.5,  color: line,   alpha: 0.28, speed: 1.0 },
  ];
  // orange mesh fill spans the band between the orange wave and the wave below it
  LINES[2].bandBelow = LINES[3];

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

    // vertical displacement (the oscillating part) of a line's wave at x
    const waveDisp = (line, x) => {
      const breathe = 0.75 + 0.25 * Math.sin(time * 0.8 + line.offset * 6);
      const amp = h * line.amp * breathe;
      const phase = time * line.speed * 2.2; // travels left -> right
      return Math.sin(x * k - phase) * amp;
    };
    // y of a given line's wave at horizontal position x
    const waveY = (line, x) => midY + h * line.offset + waveDisp(line, x);

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
        ctx.globalAlpha = 0.6;         // orange wave at 60% opacity
        ctx.fillStyle = line.color;   // orange backing
        ctx.fill();
        if (line.fillMesh) {
          // white streamlines flowing in the orange wave's direction:
          // thin lines evenly spaced between the main line (top) and the
          // wave below (bottom), each rippling with the same waveform.
          const bottom = line.bandBelow;
          const STREAMS = 5;
          ctx.globalAlpha = 1;          // keep streamlines at full strength
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = 1;
          ctx.lineCap = 'round';
          for (let i = 1; i <= STREAMS; i++) {
            const f = i / (STREAMS + 1); // 0 = top edge, 1 = bottom edge
            ctx.beginPath();
            for (let x = 0; x <= w; x += 4) {
              const y = waveY(line, x) * (1 - f) + waveY(bottom, x) * f;
              x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
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

      // the wave line itself (skip if it has no width — e.g. the main band edge)
      if (line.width > 0) {
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

// Isometric grid in the "How we build" right panel. The central 3×3 tiles are
// interactive (hover = little peek, click = full bar pop). A surrounding ring of
// "deactivated" tiles isn't interactive — it just bobs up and down in a slow
// traveling wave, phased by grid position.
function initPhaseGrid() {
  const mount = document.getElementById('iso-grid');
  if (!mount) return;
  const NS = 'http://www.w3.org/2000/svg';

  const SX = 62, SY = 31, GAP = 0.84;     // cell spacing (half-width/half-height) + gap factor
  const a = SX * GAP, b = SY * GAP;       // tile half-width / half-height (smaller than spacing → gaps)
  const HMAX = 78;                        // full bar height on click
  const ACTIVE_BASE = 26, HOVER_ADD = 16; // resting extrusion of the 3×3 (sits above the wave) + hover peek
  const AMB_BASE = 2, AMB_AMP = 13;       // ambient (deactivated) tiles bob between these heights
  const VBW = 760, VBH = 940;             // camera window (viewBox); the field is much bigger and clips
  const LO = -8, HI = 11;                 // 20×20 field; inner 0..2 is interactive, the rest is ambient
  const accent = '#ff3d00', wallR = '#c23100', wallL = '#8f2400';

  // field coords: origin at (0,0); the interactive 3×3 is centered on (1,1)
  const cxOf = (i, j) => (i - j) * SX;
  const cyOf = (i, j) => (i + j) * SY;
  // frame the viewBox on the interactive block's center so it stays the "good" size
  const focusX = cxOf(1, 1), focusY = cyOf(1, 1);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${focusX - VBW / 2} ${focusY - VBH / 2} ${VBW} ${VBH}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');  // cover the whole panel
  svg.setAttribute('class', 'iso-grid-svg');

  // draw back-to-front so raised bars overlap the tiles behind them correctly
  const order = [];
  for (let j = LO; j <= HI; j++) for (let i = LO; i <= HI; i++) order.push([i, j]);
  order.sort((p, q) => (p[0] + p[1]) - (q[0] + q[1]));

  const cells = [];
  for (const [i, j] of order) {
    const active = i >= 0 && i <= 2 && j >= 0 && j <= 2;
    const cx = cxOf(i, j), cy = cyOf(i, j);
    const g = document.createElementNS(NS, 'g');
    const top = document.createElementNS(NS, 'polygon');
    top.setAttribute('fill', accent);
    top.setAttribute('stroke', accent);
    top.setAttribute('stroke-width', '1.5');
    top.setAttribute('stroke-linejoin', 'round');

    let left = null, right = null;
    if (active) {
      // interactive tiles are full 3D bars (top + two shaded side walls)
      left = document.createElementNS(NS, 'polygon');
      right = document.createElementNS(NS, 'polygon');
      left.setAttribute('fill', wallL);
      right.setAttribute('fill', wallR);
      left.setAttribute('pointer-events', 'none');
      right.setAttribute('pointer-events', 'none');
      g.append(left, right, top);
      g.style.cursor = 'pointer';
    } else {
      // ambient tiles are flat bobbing diamonds — dim, no walls, not interactive
      g.setAttribute('opacity', '0.4');
      top.setAttribute('pointer-events', 'none');
      g.append(top);
    }
    svg.appendChild(g);

    const cell = { i, j, cx, cy, active, cur: 0, vel: 0, target: active ? ACTIVE_BASE : 0, hover: false, clicked: false, left, right, top };
    cells.push(cell);

    if (active) {
      // rests raised (ACTIVE_BASE) above the wave; hover peeks higher; click pops a full bar
      const retarget = () => { cell.target = cell.clicked ? HMAX : (cell.hover ? ACTIVE_BASE + HOVER_ADD : ACTIVE_BASE); };
      g.addEventListener('mouseenter', () => { cell.hover = true; retarget(); });
      g.addEventListener('mouseleave', () => { cell.hover = false; retarget(); });
      g.addEventListener('click', () => { cell.clicked = !cell.clicked; retarget(); });
    }
  }
  mount.appendChild(svg);

  const AMB_MAX = AMB_BASE + AMB_AMP;
  const draw = (c) => {
    const { cx, cy } = c, h = c.cur;
    c.top.setAttribute('points', `${cx},${cy - b - h} ${cx + a},${cy - h} ${cx},${cy + b - h} ${cx - a},${cy - h}`);
    if (c.active) {
      c.left.setAttribute('points',  `${cx - a},${cy - h} ${cx},${cy + b - h} ${cx},${cy + b} ${cx - a},${cy}`);
      c.right.setAttribute('points', `${cx},${cy + b - h} ${cx + a},${cy - h} ${cx + a},${cy} ${cx},${cy + b}`);
      const t = h / HMAX;
      c.top.setAttribute('fill-opacity', (0.1 + 0.9 * t).toFixed(3));
      c.left.setAttribute('fill-opacity', t.toFixed(3));
      c.right.setAttribute('fill-opacity', t.toFixed(3));
    } else {
      c.top.setAttribute('fill-opacity', (0.05 + 0.14 * (h / AMB_MAX)).toFixed(3));
    }
  };

  if (prefersReducedMotion) {
    cells.forEach((c) => { c.cur = c.active ? ACTIVE_BASE : AMB_BASE; draw(c); });
    cells.filter((c) => c.active).forEach((c) => {
      c.top.parentElement.addEventListener('mouseenter', () => { c.cur = ACTIVE_BASE + HOVER_ADD; draw(c); });
      c.top.parentElement.addEventListener('mouseleave', () => { c.cur = ACTIVE_BASE; draw(c); });
    });
    return;
  }

  const loop = (t) => {
    for (const c of cells) {
      if (c.active) {
        c.vel = (c.vel + (c.target - c.cur) * 0.18) * 0.72;   // spring w/ slight overshoot
        c.cur += c.vel;
      } else {
        const phase = (c.i + c.j) * 0.55;                      // diagonal traveling wave
        c.cur = AMB_BASE + AMB_AMP * (0.5 + 0.5 * Math.sin(t * 0.0016 - phase));
      }
      draw(c);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// The concentric ring field in the closing "Your turn" panel drifts toward the
// cursor (eased), returning smoothly. The pulse/scale is handled separately by
// initPulseBackground on the same .pulse-ring circles.
function initClosingRings() {
  const panel = document.querySelector('.closing-right');
  const svg = panel && panel.querySelector('.closing-rings-svg');
  if (!svg || prefersReducedMotion) return;
  if (window.matchMedia('(pointer: coarse)').matches) return; // skip touch devices

  const MAX = 70;        // px the field can travel from center
  const FOLLOW = 0.16;   // fraction of cursor offset to follow
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;

  const loop = () => {
    cx += (tx - cx) * 0.12;
    cy += (ty - cy) * 0.12;
    svg.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
    raf = (Math.abs(tx - cx) > 0.2 || Math.abs(ty - cy) > 0.2) ? requestAnimationFrame(loop) : null;
  };
  const clamp = (v) => Math.max(-MAX, Math.min(MAX, v));

  window.addEventListener('mousemove', (e) => {
    const r = panel.getBoundingClientRect();
    tx = clamp((e.clientX - (r.left + r.width / 2)) * FOLLOW);
    ty = clamp((e.clientY - (r.top + r.height / 2)) * FOLLOW);
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });
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
  initPhaseGrid();
  initClosingRings();
}

document.addEventListener('DOMContentLoaded', init);
