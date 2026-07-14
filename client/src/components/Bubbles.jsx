// Decorative, light-colored floating bubbles background — purely cosmetic,
// no backend involvement. Rendered once at the App level (fixed, behind
// everything, pointer-events none) so it shows through both the login
// screen and the whole dashboard background, per an explicit request.
// Sizes/positions/durations are hand-picked (not Math.random()) so the
// layout is stable across renders and safe under the sandbox's random/Date
// restrictions used elsewhere in this app's tooling.
const BUBBLES = [
  { left: '4%', size: 46, duration: 22, delay: 0 },
  { left: '12%', size: 22, duration: 16, delay: 2 },
  { left: '20%', size: 64, duration: 26, delay: 5 },
  { left: '30%', size: 30, duration: 18, delay: 1 },
  { left: '40%', size: 50, duration: 24, delay: 8 },
  { left: '50%', size: 18, duration: 14, delay: 3 },
  { left: '58%', size: 38, duration: 20, delay: 6 },
  { left: '67%', size: 58, duration: 28, delay: 0 },
  { left: '75%', size: 26, duration: 17, delay: 4 },
  { left: '83%', size: 44, duration: 23, delay: 9 },
  { left: '90%', size: 20, duration: 15, delay: 7 },
  { left: '96%', size: 34, duration: 19, delay: 2 },
];

export default function Bubbles() {
  return (
    <div className="bubbles-layer" aria-hidden="true">
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          className="bubble"
          style={{
            left: b.left,
            width: b.size,
            height: b.size,
            animationDuration: `${b.duration}s`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
