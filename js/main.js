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

// Concentric rings follow the cursor: each ring drifts toward the pointer,
// inner rings farther than outer ones — but each step stays under the gap to the
// next ring, so a ring never crosses (trespasses) its neighbour's edge.
function initRingsFollow() {
  if (prefersReducedMotion) return;
  if (window.matchMedia('(pointer: coarse)').matches) return; // skip touch devices

  const groups = Array.from(document.querySelectorAll('.ring-follow'));
  if (!groups.length) return;

  const radii = groups.map((g) => parseFloat(g.querySelector('circle').getAttribute('r')));
  const K = 0.5; // fraction of each gap a ring may drift relative to its outer neighbour
  const maxOff = radii.map(() => 0);
  for (let i = 1; i < groups.length; i++) {
    const gap = radii[i - 1] - radii[i];        // outer neighbour is the previous (larger) ring
    maxOff[i] = maxOff[i - 1] + K * gap;         // accumulate → inner rings travel more
  }

  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
  const apply = () => {
    cx += (tx - cx) * 0.08;
    cy += (ty - cy) * 0.08;
    groups.forEach((g, i) => {
      g.setAttribute('transform', `translate(${(cx * maxOff[i]).toFixed(2)} ${(cy * maxOff[i]).toFixed(2)})`);
    });
    raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.0005 ? requestAnimationFrame(apply) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(apply); };

  window.addEventListener('mousemove', (e) => {
    tx = (e.clientX / window.innerWidth) * 2 - 1;   // -1 .. 1
    ty = (e.clientY / window.innerHeight) * 2 - 1;
    kick();
  });
  window.addEventListener('mouseleave', () => { tx = 0; ty = 0; kick(); });
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

// "What we do": title reveals letter-by-letter and the Discover/Build/Verify
// divs slide in from the left in order, once the section enters the viewport.
function initWhatWeDoIntro() {
  const section = document.getElementById('what-we-do');
  if (!section) return;
  const para = section.querySelector('.outcomes-sub');   // the paragraph below the title
  const items = Array.from(section.querySelectorAll('.outcome'));

  // split the paragraph into per-letter spans (skip entirely for reduced motion)
  const letters = [];
  if (para && !prefersReducedMotion) {
    const text = para.textContent;
    para.textContent = '';
    for (const ch of text) {
      const s = document.createElement('span');
      s.textContent = ch;
      s.style.display = 'inline-block';
      s.style.whiteSpace = 'pre';   // preserve spaces + allow word wrapping
      s.style.opacity = '0';
      para.appendChild(s);
      letters.push(s);
    }
  }

  if (prefersReducedMotion) return; // leave title + items visible, no motion

  items.forEach((it) => { it.style.opacity = '0'; });

  let done = false;
  const run = () => {
    if (done) return;
    done = true;

    if (letters.length) {
      animate(letters, {
        opacity: [0, 1],
        duration: 320,
        delay: stagger(12),   // snappy per-letter reveal for the long paragraph
        ease: 'out(2)',
      });
    }
    if (items.length) {
      animate(items, {
        opacity: [0, 1],
        translateX: [-60, 0],   // slide in from the left
        duration: 600,
        delay: stagger(160),    // Discover first, then Build, then Verify
        ease: 'out(3)',
      });
      // enable the hover-pop transition once the entrance is finished
      setTimeout(() => items.forEach((it) => it.classList.add('pop')),
        600 + 160 * items.length + 80);
    }
  };

  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { run(); obs.disconnect(); } });
    }, { threshold: 0.25 });
    obs.observe(section);
  } else {
    run();
  }
}

// Clip-path reveal in the methodology right div, scrubbed by scroll: the panel
// opens (and the X/Y guide lines + corner marker track the opening vertex) as the
// element scrolls into view, and closes again as you scroll back up.
function initMethodReveal() {
  const reveal = document.getElementById('method-reveal');
  if (!reveal) return;
  const panel = reveal.querySelector('.mr-panel');
  const axisY = reveal.querySelector('.mr-axis-y');
  const axisX = reveal.querySelector('.mr-axis-x');
  const axisTop = reveal.querySelector('.mr-axis-top');
  const axisLeft = reveal.querySelector('.mr-axis-left');
  const corner = reveal.querySelector('.mr-corner');

  // scroll position drives everything directly — no CSS transitions
  [panel, axisY, axisX, axisTop, axisLeft, corner].forEach((el) => { if (el) el.style.transition = 'none'; });

  const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v) => Math.min(1, Math.max(0, v));

  const apply = () => {
    const W = reveal.clientWidth, H = reveal.clientHeight;
    if (!W || !H) return;
    const pad = 1.25 * rootFont;              // top + left inset (20px)
    const openR = 60;                         // right inset when open → 60px
    const openB = 60;                         // bottom inset when open → 60px
    const closedR = W - pad;                  // calc(100% - 1.25rem)
    const closedB = H - pad;

    let p;
    if (prefersReducedMotion) {
      p = 1;
    } else {
      const vh = window.innerHeight;
      const top = reveal.getBoundingClientRect().top;
      const start = vh * 1.0, end = vh * 0.25; // wider range → slower, clearer diagonal
      p = clamp((start - top) / (start - end));
    }

    const r = lerp(closedR, openR, p);
    const b = lerp(closedB, openB, p);
    if (panel)  panel.style.clipPath = `inset(${pad}px ${r}px ${b}px ${pad}px)`;
    if (axisY)  { axisY.style.right = `${r}px`;  axisY.style.opacity = String(0.5 * p); }
    if (axisX)  { axisX.style.bottom = `${b}px`; axisX.style.opacity = String(0.5 * p); }
    if (axisTop)  axisTop.style.opacity = String(0.5 * p);   // fixed top edge, fades in
    if (axisLeft) axisLeft.style.opacity = String(0.5 * p);  // fixed left edge, fades in
    if (corner) { corner.style.right = `${r}px`; corner.style.bottom = `${b}px`; corner.style.opacity = String(p); }
  };

  if (prefersReducedMotion) { apply(); return; }

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { apply(); ticking = false; });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', apply);
  apply();
}

// Methodology paragraph reveals letter-by-letter when it scrolls into view.
function initMethodText() {
  const para = document.querySelector('#why-mainline .outcomes-sub');
  if (!para || prefersReducedMotion) return;

  const text = para.textContent;
  para.textContent = '';
  const letters = [];
  for (const ch of text) {
    const s = document.createElement('span');
    s.textContent = ch;
    s.style.display = 'inline-block';
    s.style.whiteSpace = 'pre';
    s.style.opacity = '0';
    para.appendChild(s);
    letters.push(s);
  }

  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    animate(letters, { opacity: [0, 1], duration: 320, delay: stagger(12), ease: 'out(2)' });
  };

  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { run(); obs.disconnect(); } });
    }, { threshold: 0.4 });
    obs.observe(para);
  } else {
    run();
  }
}

// --- Init ---
function init() {
  initPhaseReveal();
  initPulseBackground();
  initRingsFollow();
  initWwdAnim();
  initWwdMesh();
  initWwdIcons();
  initMethodWave();
  initWhatWeDoIntro();
  initMethodReveal();
  initMethodText();
}

document.addEventListener('DOMContentLoaded', init);
