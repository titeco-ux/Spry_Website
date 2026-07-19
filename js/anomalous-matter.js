// anomalous-matter.js — 9-faced polyhedron for the "How we build" panel.
//
// The solid: a triangular antiprism capped by two apexes — 6 isosceles
// triangles (3 top + 3 bottom) and 3 kite band-faces = 9 faces total
// (the vertex-figure-of-the-dual-snub-24-cell shape).
//
// The animation is scroll-scrubbed, like a timeline: rotation is driven by
// the section's scroll progress (scroll down → forward, scroll up → reverse,
// at the user's pace; it stops when scrolling stops). As the timeline advances
// the faces fill in one by one; scrolling back empties them.
//
// Requires three (via importmap CDN).

import * as THREE from "three";

const TAU = Math.PI * 2;

function ring(n, radius, y, offset) {
  return Array.from({ length: n }, (_, i) => {
    const a = offset + (i * TAU) / n;
    return new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius);
  });
}

// flatten a polygon (Vector3[]) into a triangle-fan position array
function fanPositions(poly) {
  const out = [];
  for (let i = 1; i < poly.length - 1; i++) {
    out.push(poly[0].x, poly[0].y, poly[0].z);
    out.push(poly[i].x, poly[i].y, poly[i].z);
    out.push(poly[i + 1].x, poly[i + 1].y, poly[i + 1].z);
  }
  return out;
}

export function initAnomalousMatter(mount, options = {}) {
  const opts = {
    color: "#ff3d00",
    scale: 0.9,          // smaller mesh
    turns: 1.15,         // full rotations across the whole scroll
    fillOpacity: 0.5,
    cameraZ: 3.6,
    background: null,
    scrollTarget: null,  // element whose scroll drives the timeline
    ...options,
  };

  const section = opts.scrollTarget || mount.closest("section") || document.documentElement;

  const scene = new THREE.Scene();
  if (opts.background !== null) scene.background = new THREE.Color(opts.background);

  const w0 = mount.clientWidth || window.innerWidth;
  const h0 = mount.clientHeight || window.innerHeight;
  const camera = new THREE.PerspectiveCamera(60, w0 / h0, 0.1, 1000);
  camera.position.z = opts.cameraZ;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: opts.background === null });
  renderer.setSize(w0, h0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.zIndex = "0";
  mount.appendChild(canvas);

  // ---- geometry: 8 vertices, 9 faces ------------------------------------
  const T = new THREE.Vector3(0, 1.15, 0);
  const B = new THREE.Vector3(0, -1.15, 0);
  const U = ring(3, 0.95, 0.4, 0);          // upper triangle
  const L = ring(3, 0.95, -0.4, TAU / 6);   // lower triangle, twisted 60° (antiprism)

  const faces = [
    // 6 isosceles triangles (3 top, 3 bottom)
    [T, U[0], U[1]], [T, U[1], U[2]], [T, U[2], U[0]],
    [B, L[1], L[0]], [B, L[2], L[1]], [B, L[0], L[2]],
    // 3 kite band-faces
    [U[0], L[0], L[1], U[1]],
    [U[1], L[1], L[2], U[2]],
    [U[2], L[2], L[0], U[0]],
  ];

  const group = new THREE.Group();
  group.scale.setScalar(opts.scale);
  group.rotation.x = 0.62; // fixed tilt so it reads as 3D
  scene.add(group);

  const baseColor = new THREE.Color(opts.color);

  // one translucent fill mesh per face (opacity driven by the timeline)
  const fillMeshes = faces.map((poly) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(fanPositions(poly), 3));
    const m = new THREE.MeshBasicMaterial({
      color: baseColor.clone(),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(g, m);
    group.add(mesh);
    return mesh;
  });

  // clean edge outline (hides coplanar kite diagonals via the angle threshold)
  const allTris = [];
  faces.forEach((poly) => allTris.push(...fanPositions(poly)));
  const solid = new THREE.BufferGeometry();
  solid.setAttribute("position", new THREE.Float32BufferAttribute(allTris, 3));
  const edgesGeom = new THREE.EdgesGeometry(solid, 24);
  const edges = new THREE.LineSegments(
    edgesGeom,
    new THREE.LineBasicMaterial({ color: baseColor.clone() })
  );
  group.add(edges);
  solid.dispose();

  // ---- scroll-scrubbed timeline -----------------------------------------
  const N = faces.length;
  const progress = () => {
    const r = section.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    if (total <= 0) return 0;
    return Math.min(1, Math.max(0, -r.top / total));
  };

  const render = () => {
    const p = progress();
    group.rotation.y = p * TAU * opts.turns;
    for (let i = 0; i < N; i++) {
      // face i fills as the timeline passes its slot; empties on scroll-back
      const o = Math.min(1, Math.max(0, p * N - i));
      fillMeshes[i].material.opacity = o * opts.fillOpacity;
    }
    renderer.render(scene, camera);
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { render(); ticking = false; });
  };
  const onResize = () => {
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    render();
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  render(); // initial frame

  return {
    destroy() {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      fillMeshes.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
      edgesGeom.dispose();
      edges.material.dispose();
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
    setColor(c) {
      baseColor.set(c);
      edges.material.color.set(c);
      fillMeshes.forEach((m) => m.material.color.set(c));
    },
  };
}
