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
const sectionNum = document.getElementById('sectionNum');

// The innermost (smallest) circle is the shared center — it stays intact.
const CENTER = 0;

const track = document.querySelector('.track');
const stage = document.getElementById('stage');

// Nested scales at the start so the 9 discs read as concentric rings.
const START_SCALES = [0.8, 1.6, 2.4, 3.2, 4.0, 4.8, 5.6, 6.4, 7.2];

// Fold 6: the line dots are shrunk to this scale.
const LINE_SCALE = 0.35;

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

  const midX = W / 2;                             // folds 5/7: middle
  const bottomCenterY = H;                        // fold 8: center at bottom edge
  const lineX = W * 0.8;                          // fold 6: vertical line, right side
  const lineGap = Math.min(H * 0.075, 58);        // fold 6: spacing of the line dots
  const lineScale = LINE_SCALE;                   // fold 6: small dots

  timeline = anime.timeline({
    autoplay: false,
    easing: 'easeInOutSine',
  });

  const n = circles.length;

  circles.forEach((el, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const gx = gridX + (col - 1) * spacing;
    const gy = gridY + (row - 1) * spacing;
    const S = START_SCALES[i];
    const lineY = centerY + (i - (n - 1) / 2) * lineGap; // fold 6 stack position

    // Establish the starting pose (concentric, at top-center).
    anime.set(el, { translateX: startX, translateY: startY, scale: S });

    // Timeline (total 8300 units). Positions/scale only — the fold-4 ring
    // "opening" is a separate scroll-driven effect (see render()).
    //   Fold 1  concentric top    -> 3x3 grid (left)          [0    -> 1500]
    //   Fold 2/3 grid -> concentric rings (right)             [1500 -> 2500]
    //   Fold 4  concentric hold — rings open in place         [2500 -> 3500]
    //   Fold 5  -> concentric middle (back to normal)         [3500 -> 4700]
    //   Fold 6  -> vertical line of small dots (right)        [4700 -> 5900]
    //   Fold 7  -> concentric middle again                    [5900 -> 7100]
    //   Fold 8  -> concentric middle-bottom (center at edge)  [7100 -> 8300]
    timeline.add({
      targets: el,
      translateX: [
        { value: startX, duration: 400 }, // fold1
        { value: gx,     duration: 400 },
        { value: gx,     duration: 200 },
        { value: gx,     duration: 500 }, // grid hold
        { value: gx,     duration: 200 }, // fold2/3 arched diagonal
        { value: rightX, duration: 800 },
        { value: rightX, duration: 1000 }, // fold4 hold (opens here)
        { value: midX,   duration: 800 },  // fold5 -> middle
        { value: midX,   duration: 400 },
        { value: lineX,  duration: 800 },  // fold6 -> line (right)
        { value: lineX,  duration: 400 },
        { value: midX,   duration: 800 },  // fold7 -> middle
        { value: midX,   duration: 400 },
        { value: midX,   duration: 800 },  // fold8 -> bottom (X stays middle)
        { value: midX,   duration: 400 },
      ],
      translateY: [
        { value: gridY,   duration: 400 }, // fold1
        { value: gridY,   duration: 300 },
        { value: gy,      duration: 300 },
        { value: gy,      duration: 500 }, // grid hold
        { value: centerY, duration: 800 }, // fold2/3
        { value: centerY, duration: 200 },
        { value: centerY, duration: 1000 }, // fold4 hold
        { value: centerY, duration: 800 },  // fold5 (Y stays center)
        { value: centerY, duration: 400 },
        { value: lineY,   duration: 800 },  // fold6 line spread
        { value: lineY,   duration: 400 },
        { value: centerY, duration: 800 },  // fold7 back to center
        { value: centerY, duration: 400 },
        { value: bottomCenterY, duration: 800 }, // fold8 -> bottom
        { value: bottomCenterY, duration: 400 },
      ],
      scale: [
        { value: 1,         duration: 1000 }, // fold1 shrink to grid dot
        { value: 1,         duration: 500 },  // grid hold
        { value: S,         duration: 1000 }, // fold2/3 grow to ring
        { value: S,         duration: 1000 }, // fold4 hold
        { value: S,         duration: 800 },  // fold5 (concentric middle)
        { value: S,         duration: 400 },
        { value: lineScale, duration: 800 },  // fold6 shrink to line dots
        { value: lineScale, duration: 400 },
        { value: S,         duration: 800 },  // fold7 back to concentric
        { value: S,         duration: 400 },
        { value: S,         duration: 800 },  // fold8
        { value: S,         duration: 400 },
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

  // Section counter (1–8) based on which fold we're in.
  const section =
    p < 0.09 ? 1 : p < 0.22 ? 2 : p < 0.33 ? 3 : p < 0.50 ? 4 :
    p < 0.61 ? 5 : p < 0.72 ? 6 : p < 0.88 ? 7 : 8;
  sectionNum.textContent = `0${section} / 08`;

  // Interaction is enabled ONLY during the grid dwell.
  const inGrid = p > 0.125 && p < 0.178;
  stage.classList.toggle('is-grid', inGrid);

  // Act 4: each concentric circle opens its OWN body into a ring-arc, all on
  // the same shared center. Rings open ONE AT A TIME, BIGGEST first, and only
  // once the previous is fully open. As the fold completes the opened rings
  // STOP pulsing and fade by size (biggest = most transparent), while the
  // center circle keeps pulsing and ramps up to full-opacity orange. No zoom.
  // Fold-4 opening is a "bump": rings open over the concentric-right dwell,
  // then close again as fold 5 pulls the component back to normal.
  const openUp = clamp01((p - 0.32) / 0.10);   // opens  0.32 -> 0.42
  const openDown = clamp01((p - 0.44) / 0.07); // closes 0.44 -> 0.51
  const openT = openUp * (1 - openDown);
  const OPENERS = dots.length - 1; // every circle except CENTER
  const now = performance.now() / 1000;

  // Fold 6: weight for the traveling wave (0 outside the line state).
  const fold6 = clamp01((p - 0.57) / 0.05) * (1 - clamp01((p - 0.71) / 0.05));
  // Amplitude in dot-space (compensated for the small line scale so it reads).
  const waveAmp = (22 / LINE_SCALE) * fold6;

  for (let i = 0; i < dots.length; i++) {
    const dot = dots[i];

    // Staggered breathing pulse value 0..1 (period ~2.6s).
    const breath = 0.5 + 0.5 * Math.sin(now * (Math.PI * 2 / 2.6) + i * 0.7);
    const base = 0.4 - 0.18 * breath; // default breathing opacity (0.4..0.22)

    // Ease this circle's grid-hover "open" amount toward its target.
    const hoverGoal = inGrid && hovered === i ? 1 : 0;
    hoverAmt[i] += (hoverGoal - hoverAmt[i]) * 0.14;
    if (Math.abs(hoverAmt[i] - hoverGoal) < 0.001) hoverAmt[i] = hoverGoal;

    // Defaults: full breathing pulse (scale + opacity).
    let scale = 1 + 0.12 * breath;
    let opacity = base;
    let sweep = null; // visible arc angle in deg (null = solid disc)
    let hole = 0;     // inner ratio %
    let from = -90;   // conic start angle

    if (openT > 0) {
      if (i === CENTER) {
        // Center stays a solid disc, keeps pulsing, ramps to full opacity.
        opacity = base + (1 - base) * openT;
      } else {
        // Opening rings: pulse eases out; opacity fades by size, deepening
        // toward the final frame. Biggest ring -> most transparent.
        scale = 1 + 0.12 * breath * (1 - openT);
        const targetLow = 0.15 + (1 - i / OPENERS) * 0.3; // 0.15 (big) .. ~0.41
        opacity = base + (targetLow - base) * openT;

        const seq = OPENERS - i; // biggest ring first
        const local = clamp01(openT * OPENERS - seq);
        if (local > 0) {
          sweep = 360 - local * 72; // -> 288deg (80% arc, 20% gap)
          hole = local * 90;        // -> 90% inner ratio (very thin ring)
          from = 90 - sweep / 2;    // gap stays centered on the LEFT (270deg)
        }
      }
    } else if (hoverAmt[i] > 0) {
      // Hover-driven opening of this grid circle's OWN body.
      sweep = 360 - hoverAmt[i] * 72; // -> 288deg (80% arc)
      hole = hoverAmt[i] * 40;        // -> 40% inner ratio
      from = -90;
    }

    // Fold 6: traveling sine wave along the line — each dot sways left/right,
    // the crest moving smoothly down the column over time.
    const wave = waveAmp > 0 ? waveAmp * Math.sin(i * 0.9 - now * 1.6) : 0;
    dot.style.transform = `translateX(${wave}px) scale(${scale})`;
    dot.style.opacity = opacity;

    if (sweep === null) {
      // Solid filled disc — clear any inline arc overrides.
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

build();
loop(); // start the continuous smoothed render loop
window.addEventListener('resize', onResize);
