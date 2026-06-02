/**
 * Compress product and shared-gallery images in place.
 * Run: npm run compress:images
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const dirs = [
  path.join(root, "Image"),
  path.join(root, "shared-gallery")
];
const SKIP_DIRS = new Set(["_originals", "shared"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_PRODUCT = 1400;
const MAX_CARD_ON = 990;
const MAX_SHARED = 1200;
const MIN_BYTES_TO_TOUCH = 80 * 1024;

function walkImages(dir, out) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(function (name) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) return;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walkImages(full, out);
      return;
    }
    const ext = path.extname(name).toLowerCase();
    if (!IMAGE_EXT.has(ext)) return;
    out.push(full);
  });
}

function formatBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
}

async function convertOnPngToWebp(filePath) {
  if (!/-on\.png$/i.test(filePath)) return null;
  const webpPath = filePath.replace(/\.png$/i, ".webp");
  if (fs.existsSync(webpPath)) return null;

  const before = fs.statSync(filePath).size;
  const tmp = webpPath + ".compress-tmp";
  await sharp(filePath, { failOn: "none" })
    .rotate()
    .resize({ width: MAX_CARD_ON, withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toFile(tmp);

  const after = fs.statSync(tmp).size;
  if (after >= before) {
    fs.unlinkSync(tmp);
    return null;
  }

  fs.renameSync(tmp, webpPath);
  fs.unlinkSync(filePath);
  return { from: filePath, to: webpPath, before, after };
}

async function compressOne(filePath) {
  const before = fs.statSync(filePath).size;
  if (before < MIN_BYTES_TO_TOUCH) {
    return { filePath, before, after: before, skipped: true };
  }

  const isShared = filePath.includes(path.sep + "shared-gallery" + path.sep);
  const maxWidth = isShared ? MAX_SHARED : MAX_PRODUCT;
  const ext = path.extname(filePath).toLowerCase();
  const tmp = filePath + ".compress-tmp";

  let pipeline = sharp(filePath, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  if (meta.width && meta.width > maxWidth) {
    pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
  }

  if (ext === ".webp") {
    await pipeline.webp({ quality: 82, effort: 4 }).toFile(tmp);
  } else if (ext === ".jpg" || ext === ".jpeg") {
    await pipeline.jpeg({ quality: 84, mozjpeg: true }).toFile(tmp);
  } else if (ext === ".png") {
    await pipeline.png({ compressionLevel: 9, palette: meta.width <= 512 }).toFile(tmp);
  }

  const after = fs.statSync(tmp).size;
  if (after >= before) {
    fs.unlinkSync(tmp);
    return { filePath, before, after: before, skipped: true };
  }

  fs.renameSync(tmp, filePath);
  return { filePath, before, after, skipped: false };
}

function replaceOnPngRefsInHtml() {
  const htmlFiles = [
    path.join(root, "index.html"),
    path.join(root, "collections", "all", "index.html")
  ];
  htmlFiles.forEach(function (htmlPath) {
    if (!fs.existsSync(htmlPath)) return;
    const text = fs.readFileSync(htmlPath, "utf8");
    const next = text.replace(/-on\.png/gi, "-on.webp");
    if (next !== text) {
      fs.writeFileSync(htmlPath, next);
      console.log("  updated " + path.relative(root, htmlPath));
    }
  });
}

async function run() {
  const onPngs = [];
  walkImages(path.join(root, "Image"), onPngs);
  const toConvert = onPngs.filter(function (p) {
    return /-on\.png$/i.test(p);
  });

  if (toConvert.length) {
    console.log("Converting " + toConvert.length + " -on.png to -on.webp...");
    let converted = 0;
    let convertSaved = 0;
    for (let i = 0; i < toConvert.length; i += 1) {
      try {
        const result = await convertOnPngToWebp(toConvert[i]);
        if (result) {
          converted += 1;
          convertSaved += result.before - result.after;
          console.log(
            "  " + path.relative(root, result.from) +
              ": " + formatBytes(result.before) + " -> " +
              path.basename(result.to) + " " + formatBytes(result.after)
          );
        }
      } catch (err) {
        console.warn("  skip " + path.relative(root, toConvert[i]) + ": " + (err.message || err));
      }
    }
    if (converted) {
      replaceOnPngRefsInHtml();
      console.log(
        "Converted " + converted + " light-on PNG(s), saved " + formatBytes(convertSaved) + ".\n"
      );
    }
  }

  const files = [];
  dirs.forEach(function (dir) {
    walkImages(dir, files);
  });

  console.log("Compressing " + files.length + " images...");
  let saved = 0;
  let touched = 0;

  for (let i = 0; i < files.length; i += 1) {
    const filePath = files[i];
    try {
      const result = await compressOne(filePath);
      if (!result.skipped && result.after < result.before) {
        touched += 1;
        saved += result.before - result.after;
        console.log(
          "  " + path.relative(root, result.filePath) +
            ": " + formatBytes(result.before) + " -> " + formatBytes(result.after)
        );
      }
    } catch (err) {
      console.warn("  skip " + path.relative(root, filePath) + ": " + (err.message || err));
    }
  }

  console.log("");
  console.log("Done. Optimized " + touched + " file(s), saved " + formatBytes(saved) + " total.");
  if (touched || toConvert.length) {
    console.log("Run: node scripts/sync-catalog-from-images.js && npm run sync:shared-gallery");
  }
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
