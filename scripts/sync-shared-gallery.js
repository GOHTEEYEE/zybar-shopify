/**
 * Scan shared-gallery/ and write data/shared-gallery.json.
 * Drop images/videos into shared-gallery/, then run:
 *   npm run sync:shared-gallery
 *
 * Video poster (optional): same name + "-poster", e.g.
 *   led-demo.mp4  +  led-demo-poster.jpg
 *
 * Informational media (USB/remote/FAQ/guides): set "role": "info" in the
 * JSON (preserved on re-sync), prefix the filename with "info-", or use
 * keywords like usb/remote/faq/guide in the filename.
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

function loadPreviousMeta() {
  try {
    const prev = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const map = {};
    (prev.items || []).forEach(function (item) {
      if (!item || !item.src) return;
      map[item.src] = {
        role: item.role || "",
        kind: item.kind || "",
        gallery: item.gallery
      };
    });
    return map;
  } catch (err) {
    return {};
  }
}

function isInfoPath(filePath) {
  const lower = String(filePath || "").toLowerCase();
  if (/\/info\//.test(lower) || /(^|\/|-)info([-_.]|$)/.test(lower)) return true;
  return /usb|adapter|remote|install|faq|guide|manual|packaging|packing|accessory|infographic|comparison/.test(
    lower
  );
}

function buildItems() {
  if (!fs.existsSync(sourceDir)) {
    fs.mkdirSync(sourceDir, { recursive: true });
    return [];
  }

  const previousMeta = loadPreviousMeta();
  const all = sortFiles(fs.readdirSync(sourceDir));
  const posters = {};

  all.forEach(function (file) {
    if (SKIP_NAMES.has(file.toLowerCase())) return;
    if (!isPosterFile(file)) return;
    const base = getPosterBase(file);
    posters[base] = "/shared-gallery/" + file;
  });

  const items = [];
  all.forEach(function (file) {
    if (SKIP_NAMES.has(file.toLowerCase())) return;
    if (isPosterFile(file)) return;
    const ext = path.extname(file).toLowerCase();
    const base = path.basename(file, ext);
    const src = "/shared-gallery/" + file;
    const prev = previousMeta[src] || {};

    if (VIDEO_EXT.has(ext)) {
      const videoItem = {
        type: "video",
        src: src,
        poster: posters[base] || posters[file] || ""
      };
      if (prev.role) videoItem.role = prev.role;
      if (prev.kind) videoItem.kind = prev.kind;
      if (prev.gallery === false) videoItem.gallery = false;
      items.push(videoItem);
      return;
    }
    if (IMAGE_EXT.has(ext)) {
      const imageItem = { type: "image", src: src };
      if (prev.role) imageItem.role = prev.role;
      else if (isInfoPath(src) || isInfoPath(file)) imageItem.role = "info";
      if (prev.kind) imageItem.kind = prev.kind;
      if (prev.gallery === false) imageItem.gallery = false;
      items.push(imageItem);
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
    const meta = item.role ? " [" + item.role + "]" : "";
    console.log(
      "  " +
        (i + 1) +
        ". " +
        item.type +
        " " +
        item.src +
        meta +
        (item.poster ? " (poster: " + item.poster + ")" : "")
    );
  });
  if (!items.length) {
    console.log("Drop files into shared-gallery/ then run this command again.");
  }
}

run();
