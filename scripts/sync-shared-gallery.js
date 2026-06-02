/**
 * Scan shared-gallery/ and write data/shared-gallery.json.
 * Drop images/videos into shared-gallery/, then run:
 *   npm run sync:shared-gallery
 *
 * Video poster (optional): same name + "-poster", e.g.
 *   led-demo.mp4  +  led-demo-poster.jpg
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const sourceDir = path.join(root, "shared-gallery");
const outputPath = path.join(root, "data", "shared-gallery.json");

const IMAGE_EXT = new Set([".webp", ".jpg", ".jpeg", ".png", ".gif"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov"]);
const SKIP_NAMES = new Set([".gitkeep", ".ds_store", "readme.txt", "readme.md", ".gitignore"]);

function isPosterFile(name) {
  return /-poster\.(webp|jpg|jpeg|png|gif)$/i.test(name);
}

function getPosterBase(name) {
  return name.replace(/-poster\.(webp|jpg|jpeg|png|gif)$/i, "");
}

function sortFiles(files) {
  return files.slice().sort(function (a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });
}

function encodeMediaPath(filePath) {
  return String(filePath || "")
    .split("/")
    .map(function (segment, index) {
      if (!segment) return index === 0 ? "" : segment;
      return encodeURIComponent(segment);
    })
    .join("/");
}

function buildItems() {
  if (!fs.existsSync(sourceDir)) {
    fs.mkdirSync(sourceDir, { recursive: true });
    return [];
  }

  const all = sortFiles(fs.readdirSync(sourceDir));
  const posters = {};

  all.forEach(function (file) {
    if (SKIP_NAMES.has(file.toLowerCase())) return;
    if (!isPosterFile(file)) return;
    const base = getPosterBase(file);
    posters[base] = encodeMediaPath("/shared-gallery/" + file);
  });

  const items = [];
  all.forEach(function (file) {
    if (SKIP_NAMES.has(file.toLowerCase())) return;
    if (isPosterFile(file)) return;
    const ext = path.extname(file).toLowerCase();
    const base = path.basename(file, ext);
    const src = encodeMediaPath("/shared-gallery/" + file);

    if (VIDEO_EXT.has(ext)) {
      items.push({
        type: "video",
        src: src,
        poster: posters[base] || posters[file] || ""
      });
      return;
    }
    if (IMAGE_EXT.has(ext)) {
      items.push({ type: "image", src: src });
    }
  });

  return items;
}

function run() {
  const items = buildItems();
  const payload = {
    updatedAt: new Date().toISOString(),
    sourceFolder: "shared-gallery/",
    items: items
  };
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log("Shared gallery synced: " + items.length + " item(s) -> data/shared-gallery.json");
  items.forEach(function (item, i) {
    console.log("  " + (i + 1) + ". " + item.type + " " + item.src + (item.poster ? " (poster: " + item.poster + ")" : ""));
  });
  if (!items.length) {
    console.log("Drop files into shared-gallery/ then run this command again.");
  }
}

run();
