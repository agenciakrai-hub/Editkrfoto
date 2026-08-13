# Image Integration Testing Playbook

## Image Handling Rules
- Always use base64-encoded images for tests/requests.
- Accepted formats: JPEG, PNG, WEBP only. No SVG/BMP/HEIC.
- No blank/solid-color images — must contain real visual features.
- Re-detect MIME after any transform; transcode odd formats to PNG/JPEG.
- Animated inputs: use first frame only.
- Resize oversized images to reasonable bounds.

## Endpoint under test
POST /api/photographer-styles  { name, gallery_url } -> creates profile (status analyzing -> ready),
runs vision analysis over scraped gallery images, fills color_profile + edit_profile + description + confidence.
GET /api/photographer-styles -> list. DELETE /api/photographer-styles/{id}.
