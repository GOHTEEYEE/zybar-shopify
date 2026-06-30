const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..', '..');
const IMAGE_DIR = path.join(ROOT, 'Image');

function toDisplayNameFromSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map(function (part) {
      if (/^[a-z]$/.test(part)) return part.toUpperCase();
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

function getExplicitLedColorFromSlug(slug, name) {
  const s = String(slug || '').toLowerCase();
  const n = String(name || '').toLowerCase();

  if (s.indexOf('white') !== -1 || /\bwhite\b/.test(n)) return 'White';
  if (s.indexOf('yellow') !== -1 || /\byellow\b/.test(n)) return 'Yellow';
  if (s.indexOf('green') !== -1 || /\bgreen\b/.test(n)) return 'Green';
  if (s.indexOf('grey') !== -1 || s.indexOf('gray') !== -1 || /\bgrey\b/.test(n) || /\bgray\b/.test(n)) return 'White';
  if (s.indexOf('black') !== -1 || /\bblack\b/.test(n)) return 'White';
  if (s.indexOf('oragne') !== -1 || s.indexOf('orange') !== -1 || /\borange\b/.test(n)) return 'Orange';
  if (s.indexOf('blue') !== -1 || /\bblue\b/.test(n)) return 'Blue';
  if (s.indexOf('red') !== -1 || /\bred\b/.test(n)) return 'Red';
  if (s.indexOf('purple') !== -1 || /\bpurple\b/.test(n)) return 'Purple';
  if (s.indexOf('neon') !== -1 || /\bneon\b/.test(n)) return null;
  if (s.indexOf('tailight') !== -1 || s.indexOf('taillight') !== -1) return null;
  if (s.indexOf('dark-colour') !== -1 || s.indexOf('dark-color') !== -1) return null;
  return null;
}

function rgbToHue(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return h;
}

function classifyGlowPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  if (max !== min) {
    s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  }

  if (l < 0.1) return null;
  if (s < 0.1 && l < 0.42) return null;

  const isGlow = l > 0.52 || (s > 0.28 && l > 0.32);
  if (!isGlow) return null;

  const weight = s * l * (0.65 + l * 0.35);
  if (s < 0.16 && l > 0.58) return { color: 'White', weight: weight * 1.15 };

  const hue = rgbToHue(r, g, b);
  if (hue < 12 || hue >= 348) return { color: 'Red', weight: weight };
  if (hue < 38) return { color: 'Orange', weight: weight };
  if (hue < 68) return { color: 'Yellow', weight: weight };
  if (hue < 155) return { color: 'Green', weight: weight };
  if (hue < 205) return { color: 'Blue', weight: weight };
  if (hue < 285) return { color: 'Purple', weight: weight };
  return { color: 'Red', weight: weight * 0.85 };
}

async function detectLedColorFromImage(imagePath) {
  const { data } = await sharp(imagePath)
    .resize(96, 96, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = {
    White: 0,
    Red: 0,
    Orange: 0,
    Yellow: 0,
    Green: 0,
    Blue: 0,
    Purple: 0
  };

  for (let i = 0; i < data.length; i += 3) {
    const hit = classifyGlowPixel(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    if (!hit) continue;
    buckets[hit.color] = (buckets[hit.color] || 0) + hit.weight;
  }

  const ranked = Object.keys(buckets)
    .map(function (color) {
      return { color: color, score: buckets[color] };
    })
    .sort(function (a, b) {
      return b.score - a.score;
    });

  if (!ranked.length || ranked[0].score <= 0) return 'White';

  const top = ranked[0];
  const second = ranked[1];
  const total = ranked.reduce(function (sum, row) {
    return sum + row.score;
  }, 0);

  if (top.score / total >= 0.58) return top.color;

  if (second && second.score > top.score * 0.52) {
    if (top.color === 'Orange' && second.color === 'Red') return 'Red';
    if (top.color === 'Red' && second.color === 'Orange') return 'Red';
    if (top.score / (top.score + second.score) < 0.58) return 'Multi';
  }

  if (top.color === 'Orange' && second && second.color === 'Red' && second.score > top.score * 0.55) {
    return 'Red';
  }
  return top.color;
}

function firstExistingImage(slug) {
  const bases = [slug + '-1-on', slug + '-1'];
  const exts = ['webp', 'jpg', 'jpeg', 'png'];
  for (let i = 0; i < bases.length; i += 1) {
    for (let j = 0; j < exts.length; j += 1) {
      const file = path.join(IMAGE_DIR, bases[i] + '.' + exts[j]);
      if (fs.existsSync(file)) return file;
    }
  }
  return null;
}

function getCardBaseName(name, slug) {
  let base = String(name || '').trim();
  base = base.replace(/\s*[–-]\s*(White|Yellow|Green|Grey|Gray|Black|Orange|Blue|Red|Purple|Neon)\s*$/i, '');
  base = base.replace(/\s+(White|Yellow|Green|Grey|Gray|Black|Orange|Blue|Red|Purple|Neon)\s*$/i, '');
  if (!base) base = toDisplayNameFromSlug(slug);
  return base.replace(/\s+/g, ' ').trim();
}

async function resolveLedColor(slug, name, options) {
  const opts = options || {};
  if (opts.ledColor) return opts.ledColor;

  const s = String(slug || '').toLowerCase();
  const explicit = getExplicitLedColorFromSlug(slug, name);
  if (explicit) return explicit;

  const imagePath = opts.imagePath || firstExistingImage(slug);
  if (imagePath && fs.existsSync(imagePath)) {
    try {
      let detected = await detectLedColorFromImage(imagePath);
      if (s.indexOf('tailight') !== -1 || s.indexOf('taillight') !== -1) {
        if (detected === 'Red' || detected === 'Orange') return 'Red';
        return 'Red';
      }
      if (s.indexOf('dark-colour') !== -1 || s.indexOf('dark-color') !== -1) {
        if (detected === 'Multi') return 'Multi';
      }
      return detected;
    } catch (_) {
      if (s.indexOf('tailight') !== -1) return 'Red';
      return 'White';
    }
  }
  if (s.indexOf('tailight') !== -1) return 'Red';
  return 'White';
}

function formatNeonPosterCardTitle(name, slug, ledColor) {
  const color = ledColor || 'White';
  return getCardBaseName(name, slug) + ' NEON Poster(' + color + ' LED)';
}

module.exports = {
  ROOT,
  IMAGE_DIR,
  toDisplayNameFromSlug,
  getExplicitLedColorFromSlug,
  detectLedColorFromImage,
  firstExistingImage,
  getCardBaseName,
  resolveLedColor,
  formatNeonPosterCardTitle
};
