const fs = require('node:fs');
const path = require('node:path');

const size = 256;
const xorSize = size * size * 4;
const andRowSize = Math.ceil(size / 32) * 4;
const imageSize = 40 + xorSize + andRowSize * size;
const output = Buffer.alloc(22 + imageSize);
output.writeUInt16LE(0, 0); output.writeUInt16LE(1, 2); output.writeUInt16LE(1, 4);
output.writeUInt8(size === 256 ? 0 : size, 6); output.writeUInt8(size === 256 ? 0 : size, 7); output.writeUInt8(0, 8); output.writeUInt8(0, 9);
output.writeUInt16LE(1, 10); output.writeUInt16LE(32, 12); output.writeUInt32LE(imageSize, 14); output.writeUInt32LE(22, 18);
const dib = 22; output.writeUInt32LE(40, dib); output.writeInt32LE(size, dib + 4); output.writeInt32LE(size * 2, dib + 8); output.writeUInt16LE(1, dib + 12); output.writeUInt16LE(32, dib + 14); output.writeUInt32LE(xorSize, dib + 20);
function pixel(x, y) {
  const cx = x - 127.5, cy = y - 127.5, radius = Math.hypot(cx, cy);
  if (radius > 116) return [0, 0, 0, 0];
  let color = [6, 31, 47, 255];
  if (radius > 100) color = [17, 213, 232, 255];
  if (x > 68 && x < 116 && y > 60 && y < 196) color = [26, 218, 237, 255];
  if (x > 108 && x < 188 && y > 64 && y < 100) color = [26, 218, 237, 255];
  if (x > 108 && x < 168 && y > 112 && y < 148) color = [26, 218, 237, 255];
  return color;
}
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const [r, g, b, a] = pixel(x, y);
  const offset = dib + 40 + ((size - 1 - y) * size + x) * 4;
  output[offset] = b; output[offset + 1] = g; output[offset + 2] = r; output[offset + 3] = a;
}
fs.mkdirSync(__dirname, { recursive: true });
fs.writeFileSync(path.join(__dirname, 'app-icon.ico'), output);
