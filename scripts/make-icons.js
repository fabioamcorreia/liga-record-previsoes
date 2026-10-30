// Gera os ícones PNG da app (icons/icon-192.png e icon-512.png) sem dependências: fundo vermelho
// arredondado com uma bola branca. Uso: node scripts/make-icons.js
const fs = require('fs'), path = require('path'), zlib = require('zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function icon(size) {
  const px = Buffer.alloc(size * size * 4);
  const r = size * 0.22, cx = size / 2, cy = size / 2, ball = size * 0.30;
  const set = (x, y, [R, G, B, A]) => { const i = (y * size + x) * 4; px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = A; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // cantos arredondados (fora = transparente)
    const dx = Math.max(r - x, 0, x - (size - 1 - r)), dy = Math.max(r - y, 0, y - (size - 1 - r));
    if (dx * dx + dy * dy > r * r) { set(x, y, [0, 0, 0, 0]); continue; }
    let col = [208, 16, 46, 255];                       // vermelho
    const d = Math.hypot(x - cx, y - cy);
    if (d < ball) {
      col = [255, 255, 255, 255];                       // bola branca
      // pentágono central e "costuras" escuras
      const a = Math.atan2(y - cy, x - cx);
      const pent = ball * 0.36 / Math.cos(((a + Math.PI / 2) % (2 * Math.PI / 5) + 2 * Math.PI / 5) % (2 * Math.PI / 5) - Math.PI / 5);
      if (d < pent) col = [22, 26, 35, 255];
      else if (d > ball * 0.93) col = [22, 26, 35, 255];
      else if (d < ball * 0.93 && d > ball * 0.42) {
        for (let k = 0; k < 5; k++) {
          const ang = -Math.PI / 2 + k * 2 * Math.PI / 5;
          const ex = cx + Math.cos(ang) * d, ey = cy + Math.sin(ang) * d;
          if (Math.hypot(x - ex, y - ey) < size * 0.012) col = [22, 26, 35, 255];
        }
      }
    }
    set(x, y, col);
  }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const dir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(dir, { recursive: true });
for (const s of [192, 512]) fs.writeFileSync(path.join(dir, `icon-${s}.png`), icon(s));
console.log('ícones criados em', dir);
