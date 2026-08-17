import { buildStyleXmp } from "./buildXmp";
import { computeBasic } from "../rawaistudio/exposureEngine";
import { computePhotometrics } from "../rawaistudio/photometricAnalysis";

function hist(pairs) {
  const h = new Array(256).fill(0);
  let t = 0;
  for (const [v, n] of pairs) { h[v] += n; t += n; }
  return { h, t };
}

test("auto básicos → XMP incluye los 6 básicos y NO la capa creativa", () => {
  const { h, t } = hist([[40, 10000]]);
  const pm = computePhotometrics({ histGlobal: h, totalGlobal: t });
  const basic = computeBasic(pm, "balanced");
  const xmp = buildStyleXmp("IMG_1.CR3", basic, "Adobe Standard");
  ["Exposure2012", "Contrast2012", "Highlights2012", "Shadows2012", "Whites2012", "Blacks2012"].forEach((a) => {
    expect(xmp).toContain(`crs:${a}`);
  });
  expect(xmp).not.toContain("crs:Clarity2012");
  expect(xmp).not.toContain("crs:Vibrance");
  expect(xmp).not.toContain("crs:Saturation");
  expect(xmp).toContain('crs:CameraProfile="Adobe Standard"');
  expect(xmp).toMatch(/crs:Exposure2012="[+-]\d\.\d{2}"/); // exposición con signo y 2 decimales
});
