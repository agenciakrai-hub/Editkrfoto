// Construye un sidecar XMP compatible con Lightroom / Camera Raw a partir de parámetros crs.
const CRS_MAP = {
  exposure: "Exposure2012",
  contrast: "Contrast2012",
  highlights: "Highlights2012",
  shadows: "Shadows2012",
  whites: "Whites2012",
  blacks: "Blacks2012",
  clarity: "Clarity2012",
  vibrance: "Vibrance",
  saturation: "Saturation",
  temperature: "Temperature",
  tint: "Tint",
};

function fmt(key, value) {
  const v = Number(value);
  if (key === "exposure") return (v >= 0 ? "+" : "") + v.toFixed(2);
  return String(Math.round(v));
}

export function buildStyleXmp(name, params, cameraProfile = "Adobe Standard") {
  const crsLines = [
    '   crs:Version="15.0"',
    '   crs:ProcessVersion="11.0"',
    `   crs:CameraProfile="${cameraProfile}"`,
    '   crs:WhiteBalance="As Shot"',
    '   crs:HasSettings="True"',
  ];
  for (const [key, attr] of Object.entries(CRS_MAP)) {
    if (params && params[key] !== undefined && params[key] !== null) {
      crsLines.push(`   crs:${attr}="${fmt(key, params[key])}"`);
    }
  }
  const now = new Date().toISOString().replace(/\.\d+Z$/, "");
  return `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="RAW AI Studio 1.0">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
   xmlns:xmp="http://ns.adobe.com/xap/1.0/"
   xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   xmp:CreatorTool="RAW AI Studio"
   xmp:ModifyDate="${now}"
   crs:Name="${(name || "Estilo").replace(/"/g, "'")}"
${crsLines.join("\n")}>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
`;
}
