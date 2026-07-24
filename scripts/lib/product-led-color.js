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

  // Only treat color words as LED when they are clearly lighting-related.
  // Body/edition colors in the slug (white/yellow/green/black…) are NOT LED colors.
  if (/\bled\b/.test(n) || /\bneon\b/.test(n)) {
    if (/\bwhite\s+led\b/.test(n)) return 'White';
    if (/\byellow\s+led\b/.test(n)) return 'Yellow';
    if (/\bgreen\s+led\b/.test(n)) return 'Green';
    if (/\bblue\s+led\b/.test(n)) return 'Blue';
    if (/\bred\s+led\b/.test(n)) return 'Red';
    if (/\borange\s+led\b/.test(n)) return 'Orange';
    if (/\bpurple\s+led\b/.test(n)) return 'Purple';
    if (/\bmulti\s+led\b/.test(n)) return 'Multi';
  }
  if (s.indexOf('neon') !== -1 && s.indexOf('yellow') !== -1) return 'Yellow';
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

  // Path A: blown-out / cool-white headlight cores
  if (l >= 0.78 && (s < 0.3 || max - min < 0.14)) {
    return { color: 'White', weight: (0.8 + l) * 1.4 };
  }

  // Path B: saturated colored LED glow (red/blue/yellow can be dimmer than white cores)
  // Keep luminance high so orange/red body paint is not mistaken for headlights.
  if (l < 0.62 || s < 0.38) return null;
  if (l < 0.7 && s < 0.5) return null;

  const weight = s * (0.45 + l) * (l >= 0.7 ? 1.25 : 1);
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
    .resize(128, 128, { fit: 'inside' })
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
  const colored = ranked.filter(function (row) {
    return row.color !== 'White' && row.score > 0;
  });
  const coloredTotal = colored.reduce(function (sum, row) {
    return sum + row.score;
  }, 0);
  const whiteScore = buckets.White || 0;
  const total = ranked.reduce(function (sum, row) {
    return sum + row.score;
  }, 0);

  // If a saturated LED color is meaningful vs white cores, prefer that color.
  // Avoid labeling red body paint as LED when white headlights dominate.
  if (colored.length && coloredTotal > 0) {
    const leadColor = colored[0];
    const leadShareOfColor = leadColor.score / coloredTotal;
    const vsWhite = whiteScore > 0 ? leadColor.score / whiteScore : 99;
    if (leadShareOfColor >= 0.55 && (vsWhite >= 0.22 || whiteScore < leadColor.score * 2.2)) {
      if (colored.length > 1 && colored[1].score > leadColor.score * 0.55) {
        return 'Multi';
      }
      if (leadColor.color === 'Orange' && colored[1] && colored[1].color === 'Red') return 'Red';
      if (leadColor.color === 'Red' && colored[1] && colored[1].color === 'Orange') return 'Red';
      return leadColor.color;
    }
  }

  if (top.color === 'White' || top.score / total >= 0.55) return 'White';

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
  // Trust curated products.json ledColor when present.
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
