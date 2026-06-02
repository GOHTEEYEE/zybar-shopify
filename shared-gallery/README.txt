SHARED GALLERY — add once, shows on ALL product pages
====================================================

1) Put your demo images and videos in THIS folder (shared-gallery/).

   Examples:
     lifestyle-room.jpg
     led-demo.mp4
     led-demo-poster.jpg     (thumbnail for the video; optional)

2) Run sync:
     npm run sync:shared-gallery

3) Refresh any product page. Extra thumbnails appear at the bottom.

Supported:
  Images: .jpg .jpeg .png .webp .gif
  Videos: .mp4 .webm .mov

Tips:
  - Use "-poster" before the extension for video thumbnails.
  - Files are ordered by name (01.jpg, 02.mp4 works well).
  - Do not edit data/shared-gallery.json by hand; the sync script updates it.
