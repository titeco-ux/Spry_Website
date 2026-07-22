/*
 * Concentric circles → 3x3 grid, driven by scroll via anime.js.
 *
 * We build ONE anime.js timeline that describes each circle's full journey,
 * then instead of playing it we `seek()` it to a position derived from how
 * far the user has scrolled through the tall .track element. This makes the
 * motion perfectly smooth and scrubbable in both directions.
 *
 * The path is a smooth "step": each circle first moves straight DOWN, then
 * slides LEFT, then drops DOWN again into its grid cell. Because the X and Y
 * axes are keyframed on separate schedules with easeInOutSine, the two 90°
 * corners come out as soft, rounded turns rather than hard angles.
 */

const circles = Array.from(document.querySelectorAll('.circle'));
const dots = circles.map((c) => c.querySelector('.dot'));
const headline = document.getElementById('headline');

// The innermost (smallest) circle is the shared center — it stays intact.
const CENTER = 0;

// Concentric center in viewport px (set in build) — the zoom origin for act 4.
let originX = 0;
let originY = 0;
const track = document.querySelector('.track');
const stage = document.getElementById('stage');

// Nested scales at the start so the 9 discs read as concentric rings.
const START_SCALES = [0.8, 1.6, 2.4, 3.2, 4.0, 4.8, 5.6, 6.4, 7.2];

// Grid hover state: which circle the pointer is over, and an eased 0..1
// "open" amount per circle so the hover arc opens/closes smoothly.
let hovered = -1;
const hoverAmt = new Array(circles.length).fill(0);

circles.forEach((el, i) => {
  el.addEventListener('mouseenter', () => { hovered = i; });
  el.addEventListener('mouseleave', () => { if (hovered === i) hovered = -1; });
});

let timeline;

function build() {
  const W = window.innerWidth;
  const H = window.innerHeight;

  const spacing = Math.min(120, W * 0.16);      // gap between grid cells
  const gridX = Math.max(spacing * 1.5 + 40, W * 0.22); // grid center X (left side)
  const gridY = H * 0.5;                          // grid center Y (vertical middle)

  const startX = W / 2;  // act 1 concentric center: top-center of the page
  const startY = 0;

  const centerY = H * 0.5;                        // vertical center
  const rightX = W * 0.74;                        // act 3 concentric center: right side

  // Remember the concentric center so act 4 can zoom in around that point.
  originX = rightX;
  originY = centerY;

  timeline = anime.timeline({
    autoplay: false,
    easing: 'easeInOutSine',
  });

  circles.forEach((el, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const gx = gridX + (col - 1) * spacing;
    const gy = gridY + (row - 1) * spacing;

    // Establish the starting pose (concentric, at top-center).
    anime.set(el, { translateX: startX, translateY: startY, scale: START_SCALES[i] });

    // Timeline (total 3500 units). Positions only — the act-4 "opening" of
    // each ring is a separate scroll-driven effect (see render()), and the
    // circles STAY concentric on the same shared center throughout act 4.
    //   Act 1  (0    -> 1000): concentric top    -> 3x3 grid (left)
    //   Hold   (1000 -> 1500): grid dwell (hover-arc window)
    //   Act 2  (1500 -> 2500): grid -> concentric rings (right)
    //   Hold   (2500 -> 3500): concentric dwell — rings open in place here
    timeline.add({
      targets: el,
      translateX: [
        { value: startX, duration: 400 }, // act1
        { value: gx,     duration: 400 },
        { value: gx,     duration: 200 },
        { value: gx,     duration: 500 }, // grid hold
        // Act 2: X starts a touch late and sweeps the whole way — overlapping
        // the Y move below so the corner rounds into an arched diagonal.
        { value: gx,     duration: 200 },
        { value: rightX, duration: 800 },
        { value: rightX, duration: 1000 }, // concentric hold (act4 opens here)
      ],
      translateY: [
        { value: gridY,   duration: 400 }, // act1
        { value: gridY,   duration: 300 },
        { value: gy,      duration: 300 },
        { value: gy,      duration: 500 }, // grid hold
        // Act 2: Y moves early and long, overlapping X for the diagonal arc.
        { value: centerY, duration: 800 },
        { value: centerY, duration: 200 },
        { value: centerY, duration: 1000 }, // concentric hold
      ],
      scale: [
        { value: 1,               duration: 1000 }, // act1: shrink to grid dot
        { value: 1,               duration: 500 },  // grid hold
        { value: START_SCALES[i], duration: 1000 }, // act2: grow back to ring
        { value: START_SCALES[i], duration: 1000 }, // concentric hold
      ],
    }, 0); // every circle starts at timeline position 0
  });
}

function clamp01(v) {
  return Math.min(Math.max(v, 0), 1);
}

// Raw scroll target (0..1) and the smoothed value we actually render.
// Each frame `current` eases toward `target`, so the scrub glides instead
// of snapping 1:1 to the wheel/trackpad — this is what makes it smooth.
let current = 0;

function getTarget() {
  const scrollable = track.offsetHeight - window.innerHeight;
  return clamp01(window.scrollY / scrollable);
}

function render(p) {
  // Scrub the timeline to the smoothed progress.
  timeline.seek(timeline.duration * p);

  // Headline fades in with the grid dwell (~0.286–0.429) and back out.
  const reveal = clamp01((p - 0.22) / 0.06) * (1 - clamp01((p - 0.42) / 0.05));
  headline.style.opacity = reveal;
  headline.style.transform = `translateX(${(1 - reveal) * 40}px)`;

  // Interaction is enabled ONLY during the grid dwell.
  const inGrid = p > 0.30 && p < 0.42;
  stage.classList.toggle('is-grid', inGrid);

  // Act 4: each concentric circle opens its OWN body into a ring-arc, all on
  // the same shared center. The innermost (CENTER) circle stays a solid disc.
  const openT = clamp01((p - 0.78) / 0.18);

  // Zoom the whole component in (up to 2x) around the concentric center as
  // the arcs open. Origin at that center so it scales in place.
  if (openT > 0) {
    stage.style.transformOrigin = `${originX}px ${originY}px`;
    stage.style.transform = `scale(${1 + openT})`; // 1x -> 2x
  } else {
    stage.style.transform = '';
  }

  for (let i = 0; i < dots.length; i++) {
    const dot = dots[i];

    // Ease this circle's grid-hover "open" amount toward its target.
    const hoverGoal = inGrid && hovered === i ? 1 : 0;
    hoverAmt[i] += (hoverGoal - hoverAmt[i]) * 0.14;
    if (Math.abs(hoverAmt[i] - hoverGoal) < 0.001) hoverAmt[i] = hoverGoal;

    // Decide which "open" applies. Act 4 (scroll) and grid hover never
    // overlap, since their progress windows are disjoint.
    let sweep = null; // visible arc angle in deg (null = solid disc)
    let hole = 0;     // inner ratio %
    let from = -90;   // conic start angle

    if (i !== CENTER && openT > 0) {
      // Scroll-driven act-4 opening.
      sweep = 360 - openT * 72; // -> 288deg (80% arc, 20% gap)
      hole = openT * 90;        // -> 90% inner ratio (very thin ring)
      from = -150;
    } else if (hoverAmt[i] > 0) {
      // Hover-driven opening of this grid circle's OWN body.
      sweep = 360 - hoverAmt[i] * 72; // -> 288deg (80% arc)
      hole = hoverAmt[i] * 40;        // -> 40% inner ratio
      from = -90;
    }

    if (sweep === null) {
      // Solid filled disc (default look) — clear any inline overrides.
      dot.style.background = '';
      dot.style.webkitMask = '';
      dot.style.mask = '';
    } else {
      dot.style.background =
        `conic-gradient(from ${from}deg, var(--primary) 0 ${sweep}deg, transparent ${sweep}deg 360deg)`;
      const m = `radial-gradient(closest-side, transparent 0 ${hole}%, #000 ${hole + 1}%)`;
      dot.style.webkitMask = m;
      dot.style.mask = m;
    }
  }
}

// Continuous render loop with exponential smoothing (lerp) toward target.
function loop() {
  const target = getTarget();
  current += (target - current) * 0.09; // smaller = smoother/slower catch-up
  if (Math.abs(target - current) < 0.0004) current = target; // settle exactly
  render(current);
  requestAnimationFrame(loop);
}

// Rebuild geometry on resize so the path stays correct at any size.
let resizeTimer;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    build();
    render(current);
  }, 150);
}

// Continuous breathing pulse on the inner dots. Runs on its own loop,
// fully independent of the scroll timeline (which only touches the
// wrapper .circle), so the pulse survives no matter the scroll position.
anime({
  targets: '.dot',
  scale: [1, 1.12],
  opacity: [0.4, 0.22],
  easing: 'easeInOutSine',
  duration: 1600,
  direction: 'alternate',
  loop: true,
  delay: anime.stagger(180),
});

build();
loop(); // start the continuous smoothed render loop
window.addEventListener('resize', onResize);
