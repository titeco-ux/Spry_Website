'use strict';

// --- Config ---
const TRUST_LOGOS = ['frame1', 'frame2', 'frame3', 'frame4', 'frame5', 'frame6', 'frame7'];

// --- DOM Elements ---
const phaseList = document.getElementById('phase-list');

// Fill each logo stripe. Each track holds the logo set twice so the
// translateX(-50%) loop is seamless; rows are rotated so they differ.
function initTrustMarquees() {
  const tracks = document.querySelectorAll('.marquee-track');
  tracks.forEach((track, row) => {
    const offset = row % TRUST_LOGOS.length;
    const rotated = TRUST_LOGOS.slice(offset).concat(TRUST_LOGOS.slice(0, offset));
    const fragment = document.createDocumentFragment();
    for (let copy = 0; copy < 2; copy++) {
      rotated.forEach((name) => {
        const img = document.createElement('img');
        img.src = `assets/images/${name}.svg`;
        img.alt = '';
        img.className = 'marquee-logo';
        fragment.appendChild(img);
      });
    }
    track.appendChild(fragment);
  });
}

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

// --- Init ---
function init() {
  initPhaseReveal();
  initTrustMarquees();
}

document.addEventListener('DOMContentLoaded', init);
