import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

// PNGs sintéticos para probar archivos, particiones y UI. No son MNIST
// ni sirven como evidencia del rendimiento de una CNN entrenada.
export function createImageFixture(directory) {
  for (let label = 0; label < 10; label++) {
    const folder = path.join(directory, String(label));
    fs.mkdirSync(folder, { recursive: true });
    for (let sample = 0; sample < 20; sample++) {
      const header = Buffer.alloc(13);
      header.writeUInt32BE(28, 0);
      header.writeUInt32BE(28, 4);
      header[8] = 8;
      header[9] = 6; // RGBA
      const pixels = Buffer.alloc(28 * (1 + 28 * 4));
      for (let y = 0; y < 28; y++) {
        for (let x = 0; x < 28; x++) {
          const offset = y * 113 + 1 + x * 4;
          const value = (x * 7 + y * 11 + label * 20 + sample) % 256;
          pixels[offset] = value;
          pixels[offset + 1] = (value + label) % 256;
          pixels[offset + 2] = (value + sample) % 256;
          pixels[offset + 3] = 255;
        }
      }
      const png = Buffer.concat([
        Buffer.from([137,80,78,71,13,10,26,10]),
        chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)),
        chunk("IEND", Buffer.alloc(0)),
      ]);
      fs.writeFileSync(path.join(folder, `clase_${label}_imagen_${String(sample).padStart(2,"0")}.png`), png);
    }
  }
}
