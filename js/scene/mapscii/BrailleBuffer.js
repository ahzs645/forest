// Browser-safe adaptation inspired by MapSCII's BrailleBuffer.
// Original project: https://github.com/rastapasta/mapscii (MIT)

export class BrailleBuffer {
  constructor(width, height) {
    this.width = Math.max(2, width >> 1 << 1);
    this.height = Math.max(4, height >> 2 << 2);
    this.cellWidth = this.width / 2;
    this.cellHeight = this.height / 4;
    this.brailleMap = [
      [0x1, 0x8],
      [0x2, 0x10],
      [0x4, 0x20],
      [0x40, 0x80],
    ];
    this.pixelBuffer = new Uint8Array(this.cellWidth * this.cellHeight);
    this.charBuffer = new Array(this.cellWidth * this.cellHeight);
  }

  clear() {
    this.pixelBuffer.fill(0);
    this.charBuffer.fill("");
  }

  setPixel(x, y) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || px >= this.width || py < 0 || py >= this.height) return;
    const idx = this.project(px, py);
    this.pixelBuffer[idx] |= this.brailleMap[py & 3][px & 1];
  }

  setChar(char, x, y) {
    const cx = Math.round(x / 2);
    const cy = Math.round(y / 4);
    if (cx < 0 || cx >= this.cellWidth || cy < 0 || cy >= this.cellHeight) return;
    this.charBuffer[cy * this.cellWidth + cx] = char;
  }

  writeText(text, x, y, center = false) {
    const value = String(text || "");
    let startX = Math.round(x / 2);
    const row = Math.round(y / 4);
    if (center) {
      startX -= Math.floor(value.length / 2);
    }
    for (let idx = 0; idx < value.length; idx += 1) {
      const cx = startX + idx;
      if (cx < 0 || cx >= this.cellWidth || row < 0 || row >= this.cellHeight) continue;
      this.charBuffer[row * this.cellWidth + cx] = value[idx];
    }
  }

  project(x, y) {
    return (x >> 1) + this.cellWidth * (y >> 2);
  }

  frame() {
    const rows = [];
    for (let y = 0; y < this.cellHeight; y += 1) {
      let row = "";
      for (let x = 0; x < this.cellWidth; x += 1) {
        const idx = y * this.cellWidth + x;
        row += this.charBuffer[idx] || String.fromCharCode(0x2800 + this.pixelBuffer[idx]);
      }
      rows.push(row.replace(/\s+$/g, ""));
    }
    return rows.join("\n");
  }
}
