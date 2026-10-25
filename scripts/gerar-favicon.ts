import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Cálculo simples de CRC32 para chunks PNG
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i] ?? 0;
    c ^= b;
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function criarChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function criarPng(width: number, height: number, getPixel: (x: number, y: number) => [number, number, number, number]): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits por canal
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Compressão padrão
  ihdrData[11] = 0; // Filtro padrão
  ihdrData[12] = 0; // Sem entrelaçamento
  const ihdrChunk = criarChunk('IHDR', ihdrData);

  // Scanlines com byte de filtro 0
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    scanlines[offset++] = 0; // Filtro None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y);
      scanlines[offset++] = r;
      scanlines[offset++] = g;
      scanlines[offset++] = b;
      scanlines[offset++] = a;
    }
  }

  const idatData = zlib.deflateSync(scanlines);
  const idatChunk = criarChunk('IDAT', idatData);
  const iendChunk = criarChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

// Renderiza a lente Raio-X em 32x32 com bordas arredondadas e cores oficiais (#0B100E e #5FE3B3)
function desenharRaioX(size: number): Buffer {
  // Cores:
  // Fundo: #0B100E -> [11, 16, 14, 255]
  // Accent mint: #5FE3B3 -> [95, 227, 179, 255]
  // Borda suave: #1E2623 -> [30, 38, 35, 255]

  const r = size * 0.22; // Raio dos cantos do squircle
  const cx = size * 0.44;
  const cy = size * 0.44;
  const lensR = size * 0.26;
  const strokeW = Math.max(1.2, size * 0.06);

  return criarPng(size, size, (x, y) => {
    // Distância até o squircle com cantos arredondados
    const dx = Math.max(Math.abs(x - size / 2) - (size / 2 - r), 0);
    const dy = Math.max(Math.abs(y - size / 2) - (size / 2 - r), 0);
    const distSquircle = Math.sqrt(dx * dx + dy * dy);

    if (distSquircle > r) {
      return [0, 0, 0, 0]; // Transparente fora do squircle
    }

    // Distância até o círculo da lente
    const distLens = Math.abs(Math.hypot(x - cx, y - cy) - lensR);
    if (distLens <= strokeW) {
      return [95, 227, 179, 255]; // Mint #5FE3B3
    }

    // Cabo da lupa: de (cx + lensR*0.75, cy + lensR*0.75) até (size*0.88, size*0.88)
    const handleStartX = cx + lensR * 0.72;
    const handleStartY = cy + lensR * 0.72;
    const handleEndX = size * 0.88;
    const handleEndY = size * 0.88;

    // Distância de ponto à reta do cabo
    const px = x;
    const py = y;
    const l2 = (handleEndX - handleStartX) ** 2 + (handleEndY - handleStartY) ** 2;
    const t = Math.max(0, Math.min(1, ((px - handleStartX) * (handleEndX - handleStartX) + (py - handleStartY) * (handleEndY - handleStartY)) / l2));
    const projX = handleStartX + t * (handleEndX - handleStartX);
    const projY = handleStartY + t * (handleEndY - handleStartY);
    const distHandle = Math.hypot(px - projX, py - projY);

    if (distHandle <= strokeW * 1.1) {
      return [95, 227, 179, 255];
    }

    // Sinal de pulso financeiro dentro da lente (3 segmentos de linha)
    // Segmentos normalizados para a lente:
    // P1: (cx - lensR*0.48, cy + lensR*0.2)
    // P2: (cx - lensR*0.16, cy - lensR*0.25)
    // P3: (cx + lensR*0.16, cy + lensR*0.1)
    // P4: (cx + lensR*0.48, cy - lensR*0.4)
    const pts: [number, number][] = [
      [cx - lensR * 0.46, cy + lensR * 0.22],
      [cx - lensR * 0.16, cy - lensR * 0.22],
      [cx + lensR * 0.16, cy + lensR * 0.12],
      [cx + lensR * 0.48, cy - lensR * 0.38],
    ];

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      if (!p1 || !p2) continue;
      const [x1, y1] = p1;
      const [x2, y2] = p2;
      const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
      const tPulse = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / len2));
      const nearX = x1 + tPulse * (x2 - x1);
      const nearY = y1 + tPulse * (y2 - y1);
      if (Math.hypot(px - nearX, py - nearY) <= strokeW * 0.85) {
        return [95, 227, 179, 255];
      }
    }

    // Borda do squircle
    if (distSquircle > r - 1.2) {
      return [30, 38, 35, 255]; // #1E2623
    }

    // Fundo do squircle
    return [11, 16, 14, 255]; // #0B100E
  });
}

// Cria arquivo ICO encapsulando PNG
function criarIco(pngBuffer: Buffer, width: number, height: number): Buffer {
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0); // Reservado
  icoHeader.writeUInt16LE(1, 2); // Tipo 1 = ICO
  icoHeader.writeUInt16LE(1, 4); // 1 imagem

  const dirEntry = Buffer.alloc(16);
  dirEntry[0] = width === 256 ? 0 : width;
  dirEntry[1] = height === 256 ? 0 : height;
  dirEntry[2] = 0; // Cores (0 = >=8bpp)
  dirEntry[3] = 0; // Reservado
  dirEntry.writeUInt16LE(1, 4); // Color planes
  dirEntry.writeUInt16LE(32, 6); // Bits per pixel
  dirEntry.writeUInt32LE(pngBuffer.length, 8); // Tamanho dos dados
  dirEntry.writeUInt32LE(22, 12); // Offset (6 header + 16 entry = 22)

  return Buffer.concat([icoHeader, dirEntry, pngBuffer]);
}

const root = process.cwd();
const publicDir = path.join(root, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const png32 = desenharRaioX(32);
const png180 = desenharRaioX(180);
const ico = criarIco(png32, 32, 32);

// Salva em public/
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), ico);
fs.writeFileSync(path.join(publicDir, 'icon.png'), png32);
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), png180);

// Salva em src/app/ para suporte nativo Next.js
fs.writeFileSync(path.join(root, 'src', 'app', 'favicon.ico'), ico);

console.log('Favicon e ícones gerados com sucesso!');
