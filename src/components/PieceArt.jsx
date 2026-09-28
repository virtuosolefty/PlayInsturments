/**
 * Generated cover art for a piece. No images to download or license: a
 * gradient seeded from the composer (so one composer's pieces share a family
 * of colours) and the piece's initials, with a faint stave drawn across it.
 */
function hash(str = '') {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function initials(title = '') {
  const words = title.replace(/\(.*?\)|—.*$/g, '').split(/[\s,–-]+/).filter(w => /^[A-Za-zÀ-ÿ0-9]/.test(w));
  return (words.slice(0, 2).map(w => w[0]).join('') || '♪').toUpperCase();
}

export default function PieceArt({ title, composer, size = 40, kind }) {
  const seed = hash(composer || kind || title);
  const hue = seed % 360;
  const hue2 = (hue + 35 + (hash(title) % 50)) % 360;
  const style = {
    width: size, height: size,
    '--art-a': `hsl(${hue} 62% 58%)`,
    '--art-b': `hsl(${hue2} 58% 38%)`,
  };
  return (
    <span className="piece-art" style={style} aria-hidden="true">
      <svg viewBox="0 0 40 40" preserveAspectRatio="none">
        {[14, 18, 22, 26, 30].map(y => <line key={y} x1="0" x2="40" y1={y} y2={y} />)}
      </svg>
      <b>{initials(title)}</b>
    </span>
  );
}
