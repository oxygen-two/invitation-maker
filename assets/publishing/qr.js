/* A QR encoder, written here rather than pulled in, because the project ships
   no bundler and takes no runtime dependencies (see docs/publishing.md and the
   plan's global constraints). It covers exactly what the share dialog needs: a
   public invitation URL, which is a short ASCII string — byte mode, error
   correction level M, versions 1 through 10. Level M survives a phone camera
   pointed at a laptop screen or a printed card without inflating the symbol,
   and version 10 carries 213 bytes, far more than any /i/<id> link.

   Everything below is ISO/IEC 18004: GF(256) with primitive polynomial 0x11d,
   Reed-Solomon over the block layout of table 9, the zig-zag data placement,
   and the mask chosen by evaluating all eight against the four penalty rules. */
(function (root) {
  const MIN_VERSION = 1;
  const MAX_VERSION = 10;
  const MODE_BYTE = 0b0100;
  const LEVEL_M_BITS = 0b00;
  const QUIET_ZONE = 4;

  // [error correction codewords per block, [block count, data codewords] groups]
  const BLOCK_LAYOUT = Object.freeze({
    1: { ecPerBlock: 10, groups: [[1, 16]] },
    2: { ecPerBlock: 16, groups: [[1, 28]] },
    3: { ecPerBlock: 26, groups: [[1, 44]] },
    4: { ecPerBlock: 18, groups: [[2, 32]] },
    5: { ecPerBlock: 24, groups: [[2, 43]] },
    6: { ecPerBlock: 16, groups: [[4, 27]] },
    7: { ecPerBlock: 18, groups: [[4, 31]] },
    8: { ecPerBlock: 22, groups: [[2, 38], [2, 39]] },
    9: { ecPerBlock: 22, groups: [[3, 36], [2, 37]] },
    10: { ecPerBlock: 26, groups: [[4, 43], [1, 44]] }
  });

  const ALIGNMENT_CENTERS = Object.freeze({
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  });

  const MASK_RULES = Object.freeze([
    (row, column) => (row + column) % 2 === 0,
    (row) => row % 2 === 0,
    (row, column) => column % 3 === 0,
    (row, column) => (row + column) % 3 === 0,
    (row, column) => (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0,
    (row, column) => ((row * column) % 2) + ((row * column) % 3) === 0,
    (row, column) => (((row * column) % 2) + ((row * column) % 3)) % 2 === 0,
    (row, column) => (((row + column) % 2) + ((row * column) % 3)) % 2 === 0
  ]);

  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  for (let value = 1, power = 0; power < 255; power += 1) {
    GF_EXP[power] = value;
    GF_LOG[value] = power;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let power = 255; power < 512; power += 1) GF_EXP[power] = GF_EXP[power - 255];
  const gfMultiply = (a, b) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);

  const generatorPolynomial = (degree) => {
    let poly = [1];
    for (let step = 0; step < degree; step += 1) {
      const next = new Array(poly.length + 1).fill(0);
      for (let index = 0; index < poly.length; index += 1) {
        next[index] ^= poly[index];
        next[index + 1] ^= gfMultiply(poly[index], GF_EXP[step]);
      }
      poly = next;
    }
    return poly;
  };

  const errorCorrection = (data, ecLength) => {
    const generator = generatorPolynomial(ecLength);
    const remainder = new Array(ecLength).fill(0);
    for (const byte of data) {
      const factor = byte ^ remainder[0];
      remainder.shift();
      remainder.push(0);
      for (let index = 0; index < ecLength; index += 1) {
        remainder[index] ^= gfMultiply(generator[index + 1], factor);
      }
    }
    return remainder;
  };

  const dataCodewords = (version) =>
    BLOCK_LAYOUT[version].groups.reduce((total, [count, length]) => total + count * length, 0);
  const lengthBits = (version) => (version >= 10 ? 16 : 8);
  const capacityBytes = (version) => Math.floor((dataCodewords(version) * 8 - 4 - lengthBits(version)) / 8);

  const toBytes = (text) => {
    const value = String(text ?? "");
    if (typeof TextEncoder === "function") return Array.from(new TextEncoder().encode(value));
    return Array.from(Buffer.from(value, "utf8"));
  };

  const chooseVersion = (byteCount) => {
    for (let version = MIN_VERSION; version <= MAX_VERSION; version += 1) {
      if (byteCount <= capacityBytes(version)) return version;
    }
    const error = new Error(`QR content is too long: ${byteCount} bytes exceeds ${capacityBytes(MAX_VERSION)}`);
    error.code = "QR_TOO_LONG";
    throw error;
  };

  const buildCodewords = (bytes, version) => {
    const total = dataCodewords(version);
    const bits = [];
    const push = (value, width) => {
      for (let index = width - 1; index >= 0; index -= 1) bits.push((value >> index) & 1);
    };
    push(MODE_BYTE, 4);
    push(bytes.length, lengthBits(version));
    for (const byte of bytes) push(byte, 8);
    push(0, Math.min(4, total * 8 - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);

    const codewords = [];
    for (let index = 0; index < bits.length; index += 8) {
      let byte = 0;
      for (let offset = 0; offset < 8; offset += 1) byte = (byte << 1) | bits[index + offset];
      codewords.push(byte);
    }
    const padding = [0xec, 0x11];
    while (codewords.length < total) codewords.push(padding[(codewords.length - bits.length / 8) % 2]);
    return codewords;
  };

  /* Blocks are interleaved column-wise so that a scratch across the printed
     symbol damages a few codewords of every block rather than destroying one
     block outright. */
  const interleave = (codewords, version) => {
    const { ecPerBlock, groups } = BLOCK_LAYOUT[version];
    const blocks = [];
    let cursor = 0;
    for (const [count, length] of groups) {
      for (let index = 0; index < count; index += 1) {
        const data = codewords.slice(cursor, cursor + length);
        cursor += length;
        blocks.push({ data, ec: errorCorrection(data, ecPerBlock) });
      }
    }
    const result = [];
    const longest = Math.max(...blocks.map((block) => block.data.length));
    for (let index = 0; index < longest; index += 1) {
      for (const block of blocks) if (index < block.data.length) result.push(block.data[index]);
    }
    for (let index = 0; index < ecPerBlock; index += 1) {
      for (const block of blocks) result.push(block.ec[index]);
    }
    return result;
  };

  const createTemplate = (version) => {
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
    const setFunction = (row, column, dark) => {
      if (row < 0 || column < 0 || row >= size || column >= size) return;
      modules[row][column] = dark;
      reserved[row][column] = true;
    };

    for (const [top, left] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
      for (let row = -1; row <= 7; row += 1) {
        for (let column = -1; column <= 7; column += 1) {
          const onRing = (row >= 0 && row <= 6 && (column === 0 || column === 6))
            || (column >= 0 && column <= 6 && (row === 0 || row === 6));
          const inCore = row >= 2 && row <= 4 && column >= 2 && column <= 4;
          setFunction(top + row, left + column, onRing || inCore);
        }
      }
    }
    for (let index = 8; index < size - 8; index += 1) {
      setFunction(6, index, index % 2 === 0);
      setFunction(index, 6, index % 2 === 0);
    }

    const centers = ALIGNMENT_CENTERS[version];
    const last = centers[centers.length - 1];
    for (const row of centers) {
      for (const column of centers) {
        const overlapsFinder = (row === 6 && column === 6)
          || (row === 6 && column === last) || (row === last && column === 6);
        if (overlapsFinder) continue;
        for (let dr = -2; dr <= 2; dr += 1) {
          for (let dc = -2; dc <= 2; dc += 1) {
            setFunction(row + dr, column + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
          }
        }
      }
    }

    setFunction(size - 8, 8, true);
    for (let index = 0; index <= 8; index += 1) {
      if (!reserved[8][index]) setFunction(8, index, false);
      if (!reserved[index][8]) setFunction(index, 8, false);
    }
    for (let index = 0; index < 8; index += 1) {
      if (!reserved[8][size - 1 - index]) setFunction(8, size - 1 - index, false);
      if (!reserved[size - 1 - index][8]) setFunction(size - 1 - index, 8, false);
    }
    if (version >= 7) {
      for (let index = 0; index < 18; index += 1) {
        const near = size - 11 + (index % 3);
        const far = Math.floor(index / 3);
        setFunction(near, far, false);
        setFunction(far, near, false);
      }
    }
    return { modules, reserved, size };
  };

  const placeData = (template, payload) => {
    const { modules, reserved, size } = template;
    let bit = 0;
    const totalBits = payload.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < size; vertical += 1) {
        for (let offset = 0; offset < 2; offset += 1) {
          const column = right - offset;
          const upward = ((right + 1) & 2) === 0;
          const row = upward ? size - 1 - vertical : vertical;
          if (reserved[row][column]) continue;
          if (bit < totalBits) {
            modules[row][column] = ((payload[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
          }
          // Remainder bits past the payload stay light, as the specification says.
          bit += 1;
        }
      }
    }
  };

  const formatInformation = (mask) => {
    const data = (LEVEL_M_BITS << 3) | mask;
    let remainder = data;
    for (let index = 0; index < 10; index += 1) {
      remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    }
    return (((data << 10) | (remainder & 0x3ff)) ^ 0x5412) & 0x7fff;
  };

  const versionInformation = (version) => {
    let remainder = version;
    for (let index = 0; index < 12; index += 1) {
      remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    }
    return ((version << 12) | (remainder & 0xfff)) >>> 0;
  };

  const drawFormat = (modules, size, mask) => {
    const bits = formatInformation(mask);
    const bitAt = (index) => ((bits >>> index) & 1) === 1;
    // Bits 0-7 run down column 8 beside the top-left finder and, in the second
    // copy, right-to-left along row 8; bits 8-14 do the reverse. The module at
    // (size - 8, 8) belongs to neither copy: it is the always-dark module.
    for (let index = 0; index <= 5; index += 1) modules[index][8] = bitAt(index);
    modules[7][8] = bitAt(6);
    modules[8][8] = bitAt(7);
    modules[8][7] = bitAt(8);
    for (let index = 9; index < 15; index += 1) modules[8][14 - index] = bitAt(index);
    for (let index = 0; index < 8; index += 1) modules[8][size - 1 - index] = bitAt(index);
    for (let index = 8; index < 15; index += 1) modules[size - 15 + index][8] = bitAt(index);
    modules[size - 8][8] = true;
  };

  const drawVersion = (modules, size, version) => {
    if (version < 7) return;
    const bits = versionInformation(version);
    for (let index = 0; index < 18; index += 1) {
      const dark = ((bits >>> index) & 1) === 1;
      const near = size - 11 + (index % 3);
      const far = Math.floor(index / 3);
      modules[near][far] = dark;
      modules[far][near] = dark;
    }
  };

  /* The four penalty rules of clause 7.8.3. They exist to push the encoder away
     from symbols a scanner would struggle with: long same-colour runs, solid
     blocks, anything resembling a finder pattern, and a badly skewed light/dark
     balance. */
  const runPenalty = (line) => {
    let penalty = 0;
    let run = 1;
    for (let index = 1; index < line.length; index += 1) {
      if (line[index] === line[index - 1]) {
        run += 1;
        continue;
      }
      if (run >= 5) penalty += 3 + (run - 5);
      run = 1;
    }
    return run >= 5 ? penalty + 3 + (run - 5) : penalty;
  };

  const FINDER_LIKE = [
    [true, false, true, true, true, false, true, false, false, false, false],
    [false, false, false, false, true, false, true, true, true, false, true]
  ];
  /* Rule 3 (clause 7.8.3): scanned within the row/column itself, with no
     light-module border padding added at either end before matching the
     finder-like pattern. The spec's reference implementations vary on this
     detail; every mask below still decodes correctly under this
     interpretation, which is what the scorer needs it for. */
  const finderPenalty = (line) => {
    let penalty = 0;
    for (let start = 0; start + 11 <= line.length; start += 1) {
      for (const pattern of FINDER_LIKE) {
        if (pattern.every((value, offset) => line[start + offset] === value)) penalty += 40;
      }
    }
    return penalty;
  };

  const penaltyScore = (modules, size) => {
    let score = 0;
    let dark = 0;
    for (let index = 0; index < size; index += 1) {
      const row = modules[index];
      const column = modules.map((line) => line[index]);
      score += runPenalty(row) + runPenalty(column);
      score += finderPenalty(row) + finderPenalty(column);
      dark += row.reduce((total, value) => total + (value ? 1 : 0), 0);
    }
    for (let row = 0; row < size - 1; row += 1) {
      for (let column = 0; column < size - 1; column += 1) {
        const value = modules[row][column];
        if (value === modules[row][column + 1]
          && value === modules[row + 1][column]
          && value === modules[row + 1][column + 1]) score += 3;
      }
    }
    const percent = (dark * 100) / (size * size);
    // Rule 4: the 5% step uses Math.floor rather than round/ceil on
    // Math.abs(percent - 50) / 5 — again one of several valid readings of the
    // spec's wording, and every mask still decodes correctly under it.
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;
    return score;
  };

  const encode = (text) => {
    const bytes = toBytes(text);
    const version = chooseVersion(bytes.length);
    const payload = interleave(buildCodewords(bytes, version), version);

    let best = null;
    for (let mask = 0; mask < 8; mask += 1) {
      const template = createTemplate(version);
      placeData(template, payload);
      const { modules, reserved, size } = template;
      for (let row = 0; row < size; row += 1) {
        for (let column = 0; column < size; column += 1) {
          if (!reserved[row][column] && MASK_RULES[mask](row, column)) {
            modules[row][column] = !modules[row][column];
          }
        }
      }
      drawFormat(modules, size, mask);
      drawVersion(modules, size, version);
      const score = penaltyScore(modules, size);
      if (!best || score < best.score) best = { mask, modules, score, size };
    }
    return { mask: best.mask, modules: best.modules, size: best.size, version };
  };

  const draw = (canvas, text, options = {}) => {
    const { scale = 4, margin = QUIET_ZONE, dark = "#000000", light = "#ffffff" } = options;
    const matrix = encode(text);
    const pixels = (matrix.size + margin * 2) * scale;
    canvas.width = pixels;
    canvas.height = pixels;
    const context = canvas.getContext("2d");
    if (!context) return matrix;
    // The quiet zone is part of the symbol: without it scanners lose the edges.
    context.fillStyle = light;
    context.fillRect(0, 0, pixels, pixels);
    context.fillStyle = dark;
    for (let row = 0; row < matrix.size; row += 1) {
      for (let column = 0; column < matrix.size; column += 1) {
        if (matrix.modules[row][column]) {
          context.fillRect((column + margin) * scale, (row + margin) * scale, scale, scale);
        }
      }
    }
    return matrix;
  };

  const api = { MAX_VERSION, QUIET_ZONE, capacityBytes, draw, encode };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.InvitationQR = api;
})(typeof window !== "undefined" ? window : globalThis);
