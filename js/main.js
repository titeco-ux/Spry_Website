import { animate, stagger, createAnimatable } from 'https://cdn.jsdelivr.net/npm/animejs@4/+esm';

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

// --- Init ---
function init() {
  initPhaseReveal();
  initPulseBackground();
  initCursorTilt();
}

document.addEventListener('DOMContentLoaded', init);
