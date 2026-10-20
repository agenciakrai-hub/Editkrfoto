import { readCaptureMeta, parseExifDate } from "./captureMeta";

// TIFF mínimo (II): IFD0 {Make, Model, ExifIFD} → Exif {DateTimeOriginal, SubSec, BodySerial}.
function tiff({ make = "Canon", model = "EOS R5", date = "2026:06:14 17:03:21", sub = "45", serial = "123456" } = {}) {
  const b = new Uint8Array(1024);
  const w16 = (o, v) => { b[o] = v & 0xff; b[o + 1] = (v >> 8) & 0xff; };
  const w32 = (o, v) => { w16(o, v & 0xffff); w16(o + 2, (v >>> 16) & 0xffff); };
  const str = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); b[o + s.length] = 0; };
  b.set([0x49, 0x49, 0x2a, 0x00]); w32(4, 8);
  const entry = (o, tag, type, count, val) => { w16(o, tag); w16(o + 2, type); w32(o + 4, count); w32(o + 8, val); };
  w16(8, 3);
  entry(10, 0x010f, 2, make.length + 1, 300); str(300, make);
  entry(22, 0x0110, 2, model.length + 1, 320); str(320, model);
  entry(34, 0x8769, 4, 1, 100);
  w32(46, 0);
  w16(100, 3);
  entry(102, 0x9003, 2, date.length + 1, 400); str(400, date);
  entry(114, 0x9291, 2, sub.length + 1, 0); str(122, sub);
  entry(126, 0xa431, 2, serial.length + 1, 440); str(440, serial);
  w32(138, 0);
  return b;
}

test("lee hora con subsegundos y cámara (marca+modelo+serie)", () => {
  const m = readCaptureMeta(tiff());
  expect(m.camera).toBe("Canon EOS R5 123456");
  expect(m.hasSerial).toBe(true);
  expect(m.captureTime).toBe(Date.UTC(2026, 5, 14, 17, 3, 21) + 450);
});

test("cabecera embebida (como CR3/JPEG) también se encuentra", () => {
  const inner = tiff({ serial: "99999" });
  const outer = new Uint8Array(2048); outer.set(inner, 700);
  expect(readCaptureMeta(outer).camera).toBe("Canon EOS R5 99999");
});

test("sin EXIF → nulls, nunca lanza", () => {
  expect(readCaptureMeta(new Uint8Array(64))).toEqual({ captureTime: null, camera: null, hasSerial: false });
  expect(parseExifDate("0000:00:00 00:00:00")).toBeNull();
  expect(parseExifDate(null)).toBeNull();
});
