import { readOrientation } from "./exif";

test("lee orientación EXIF (TIFF little-endian, orientation=6)", () => {
  const b = new Uint8Array([
    0x49, 0x49, 0x2a, 0x00, // "II*\0"
    0x08, 0x00, 0x00, 0x00, // offset IFD0 = 8
    0x01, 0x00,             // 1 entrada
    0x12, 0x01,             // tag 0x0112 (Orientation)
    0x03, 0x00,             // tipo SHORT
    0x01, 0x00, 0x00, 0x00, // count 1
    0x06, 0x00, 0x00, 0x00, // valor = 6
  ]);
  expect(readOrientation(b)).toBe(6);
});

test("sin cabecera EXIF → orientación normal (1)", () => {
  expect(readOrientation(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBe(1);
});
