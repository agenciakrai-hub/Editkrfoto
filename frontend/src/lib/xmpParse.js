import { defaultParameterConfig, PARAM_DEFS } from "@/lib/paramDefs";

// Mapa inverso crs: (XMP) -> claves internas de parámetros
const CRS_TO_KEY = {
  Exposure2012: "exposure",
  Contrast2012: "contrast",
  Highlights2012: "highlights",
  Shadows2012: "shadows",
  Whites2012: "whites",
  Blacks2012: "blacks",
  Clarity2012: "clarity",
  Vibrance: "vibrance",
  Saturation: "saturation",
  Temperature: "temperature",
  Tint: "tint",
};

const DEF_MAP = Object.fromEntries(PARAM_DEFS.map((p) => [p.key, p]));

function clamp(key, value) {
  const d = DEF_MAP[key];
  if (!d) return value;
  return Math.min(d.max, Math.max(d.min, value));
}

// Parsea el texto de un .xmp y devuelve una config con los parámetros crs encontrados activados.
export function parseXmp(text) {
  const config = defaultParameterConfig();
  let found = 0;
  let cameraProfile = null;
  const profileMatch = text.match(/crs:CameraProfile="([^"]+)"/);
  if (profileMatch) cameraProfile = profileMatch[1];

  for (const [crs, key] of Object.entries(CRS_TO_KEY)) {
    const re = new RegExp(`crs:${crs}="([+-]?[0-9]*\\.?[0-9]+)"`);
    const m = text.match(re);
    if (m) {
      config[key] = { enabled: true, value: clamp(key, parseFloat(m[1])) };
      found += 1;
    }
  }
  return { config, found, cameraProfile };
}
