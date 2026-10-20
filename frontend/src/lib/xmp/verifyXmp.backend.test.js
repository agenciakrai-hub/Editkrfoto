import { verifyXmp } from "./verifyXmp";
import fixtures from "./__fixtures__/backendXmp.json";

// XMP reales generados por backend/server.py (build_photo_xmp), con y sin preset.
test.each(Object.entries(fixtures))("XMP del backend (%s) supera la verificación estricta", (_, xmp) => {
  const v = verifyXmp(xmp);
  expect(v.errors).toEqual([]);
  expect(v.ok).toBe(true);
});
