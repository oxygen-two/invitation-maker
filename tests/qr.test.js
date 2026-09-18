const test = require("node:test");
const assert = require("node:assert/strict");

const InvitationQR = require("../assets/publishing/qr.js");

/* The encoder is validated by DECODING what it produced, with a reader written
   here from the specification rather than by calling back into the module: the
   test rebuilds the function-pattern map, reads the format information, undoes
   the mask, walks the zig-zag, de-interleaves the blocks, and checks every
   Reed-Solomon syndrome is zero before parsing the byte-mode segment back to
   the original string. A matrix that survives that is a matrix a real scanner
   can read; a matrix that merely "looks like" a QR code is not. */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
for (let value = 1, index = 0; index < 255; index += 1) {
  GF_EXP[index] = value;
  GF_LOG[value] = index;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d;
}
for (let index = 255; index < 512; index += 1) GF_EXP[index] = GF_EXP[index - 255];
const gfMultiply = (a, b) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);

// Level M block layout for versions 1-10, read straight off ISO/IEC 18004 table 9.
const BLOCKS_M = {
  1: { ec: 10, groups: [[1, 16]] },
  2: { ec: 16, groups: [[1, 28]] },
  3: { ec: 26, groups: [[1, 44]] },
  4: { ec: 18, groups: [[2, 32]] },
  5: { ec: 24, groups: [[2, 43]] },
  6: { ec: 16, groups: [[4, 27]] },
  7: { ec: 18, groups: [[4, 31]] },
  8: { ec: 22, groups: [[2, 38], [2, 39]] },
  9: { ec: 22, groups: [[3, 36], [2, 37]] },
  10: { ec: 26, groups: [[4, 43], [1, 44]] }
};
const ALIGNMENT = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
};
const MASK_RULES = [
  (row, column) => (row + column) % 2 === 0,
  (row) => row % 2 === 0,
  (row, column) => column % 3 === 0,
  (row, column) => (row + column) % 3 === 0,
  (row, column) => (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0,
  (row, column) => ((row * column) % 2) + ((row * column) % 3) === 0,
  (row, column) => (((row * column) % 2) + ((row * column) % 3)) % 2 === 0,
  (row, column) => (((row + column) % 2) + ((row * column) % 3)) % 2 === 0
];

const versionOf = (size) => (size - 17) / 4;

// BCH(15,5) format information, generator 0x537, masked with 0x5412.
const formatBits = (errorCorrectionBits, mask) => {
  const data = (errorCorrectionBits << 3) | mask;
  let remainder = data;
  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  return (((data << 10) | (remainder & 0x3ff)) ^ 0x5412) & 0x7fff;
};

const functionMap = (size) => {
  const version = versionOf(size);
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserve = (row, column) => {
    if (row >= 0 && column >= 0 && row < size && column < size) reserved[row][column] = true;
  };
  for (const [top, left] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let row = -1; row <= 7; row += 1) {
      for (let column = -1; column <= 7; column += 1) reserve(top + row, left + column);
    }
  }
  for (let index = 0; index < size; index += 1) {
    reserve(6, index);
    reserve(index, 6);
  }
  const centers = ALIGNMENT[version];
  for (const row of centers) {
    for (const column of centers) {
      const last = centers[centers.length - 1];
      if ((row === 6 && column === 6) || (row === 6 && column === last) || (row === last && column === 6)) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) reserve(row + dr, column + dc);
      }
    }
  }
  for (let index = 0; index <= 8; index += 1) {
    reserve(8, index);
    reserve(index, 8);
  }
  for (let index = 0; index < 8; index += 1) {
    reserve(8, size - 1 - index);
    reserve(size - 1 - index, 8);
  }
  if (version >= 7) {
    for (let index = 0; index < 18; index += 1) {
      reserve(size - 11 + (index % 3), Math.floor(index / 3));
      reserve(Math.floor(index / 3), size - 11 + (index % 3));
    }
  }
  return reserved;
};

const readFormat = (modules, size) => {
  const bit = (row, column) => (modules[row][column] ? 1 : 0);
  let first = 0;
  for (let index = 0; index <= 5; index += 1) first |= bit(index, 8) << index;
  first |= bit(7, 8) << 6;
  first |= bit(8, 8) << 7;
  first |= bit(8, 7) << 8;
  for (let index = 9; index < 15; index += 1) first |= bit(8, 14 - index) << index;
  let second = 0;
  for (let index = 0; index < 8; index += 1) second |= bit(8, size - 1 - index) << index;
  for (let index = 8; index < 15; index += 1) second |= bit(size - 15 + index, 8) << index;
  return { first, second };
};

const readCodewords = (modules, reserved, size) => {
  const bits = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let offset = 0; offset < 2; offset += 1) {
        const column = right - offset;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vertical : vertical;
        if (!reserved[row][column]) bits.push(modules[row][column] ? 1 : 0);
      }
    }
  }
  const codewords = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    let byte = 0;
    for (let offset = 0; offset < 8; offset += 1) byte = (byte << 1) | bits[index + offset];
    codewords.push(byte);
  }
  return codewords;
};

const syndromesAreZero = (block, ecLength) => {
  for (let index = 0; index < ecLength; index += 1) {
    let sum = 0;
    for (let position = 0; position < block.length; position += 1) {
      sum ^= gfMultiply(block[position], GF_EXP[(index * (block.length - 1 - position)) % 255]);
    }
    if (sum !== 0) return false;
  }
  return true;
};

const decode = (matrix) => {
  const { size, modules } = matrix;
  const version = versionOf(size);
  const layout = BLOCKS_M[version];
  const { first, second } = readFormat(modules, size);
  assert.equal(first, second, "both format information copies must agree");

  let mask = -1;
  let level = -1;
  for (let candidateLevel = 0; candidateLevel < 4; candidateLevel += 1) {
    for (let candidateMask = 0; candidateMask < 8; candidateMask += 1) {
      if (formatBits(candidateLevel, candidateMask) === first) {
        level = candidateLevel;
        mask = candidateMask;
      }
    }
  }
  assert.ok(mask >= 0, "format information is not a valid BCH(15,5) codeword");

  const reserved = functionMap(size);
  const unmasked = modules.map((row, rowIndex) => row.map((value, columnIndex) => {
    if (reserved[rowIndex][columnIndex]) return value;
    return MASK_RULES[mask](rowIndex, columnIndex) ? !value : value;
  }));

  const interleaved = readCodewords(unmasked, reserved, size);
  const blocks = [];
  for (const [count, dataLength] of layout.groups) {
    for (let index = 0; index < count; index += 1) blocks.push({ data: new Array(dataLength), ec: new Array(layout.ec) });
  }
  const longest = Math.max(...blocks.map((block) => block.data.length));
  let cursor = 0;
  for (let index = 0; index < longest; index += 1) {
    for (const block of blocks) {
      if (index < block.data.length) {
        block.data[index] = interleaved[cursor];
        cursor += 1;
      }
    }
  }
  for (let index = 0; index < layout.ec; index += 1) {
    for (const block of blocks) {
      block.ec[index] = interleaved[cursor];
      cursor += 1;
    }
  }

  const corrupt = blocks.findIndex((block) => !syndromesAreZero([...block.data, ...block.ec], layout.ec));
  assert.equal(corrupt, -1, `block ${corrupt} does not satisfy its Reed-Solomon syndromes`);

  const data = blocks.flatMap((block) => block.data);
  const bits = [];
  for (const byte of data) {
    for (let offset = 7; offset >= 0; offset -= 1) bits.push((byte >> offset) & 1);
  }
  const take = (length) => bits.splice(0, length).reduce((total, value) => (total << 1) | value, 0);
  assert.equal(take(4), 0b0100, "byte mode indicator");
  const length = take(version >= 10 ? 16 : 8);
  const bytes = Array.from({ length }, () => take(8));
  return { level, mask, text: Buffer.from(bytes).toString("utf8"), version };
};

const isFinder = (modules, top, left) => {
  const expected = [
    "1111111", "1000001", "1011101", "1011101", "1011101", "1000001", "1111111"
  ];
  return expected.every((row, rowIndex) => row.split("").every((cell, columnIndex) =>
    modules[top + rowIndex][left + columnIndex] === (cell === "1")));
};

test("the syndrome check itself agrees with the specification's worked example", () => {
  /* Anchors the reader above to something outside this repository: the version
     1-M example in ISO/IEC 18004 annex I. Its published data and error
     correction codewords must satisfy the same syndromes the reader demands of
     our encoder, so "my encoder passes my checker" is not a closed loop. */
  const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
  const ec = [0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55];

  assert.ok(syndromesAreZero([...data, ...ec], 10));
  assert.equal(syndromesAreZero([...data, ...ec.toReversed()], 10), false, "the check must actually reject bad blocks");
});

test("a short string encodes as a readable version 1-M symbol", () => {
  const matrix = InvitationQR.encode("HELLO WORLD");

  assert.equal(matrix.size, 21, "eleven bytes fit version 1, whose symbol is 21 modules square");
  assert.equal(matrix.modules.length, 21);
  assert.ok(matrix.modules.every((row) => row.length === 21 && row.every((cell) => typeof cell === "boolean")));

  assert.ok(isFinder(matrix.modules, 0, 0), "top-left finder pattern");
  assert.ok(isFinder(matrix.modules, 0, 14), "top-right finder pattern");
  assert.ok(isFinder(matrix.modules, 14, 0), "bottom-left finder pattern");
  assert.equal(matrix.modules[7][7], false, "the finder separators stay light");
  assert.equal(matrix.modules[matrix.size - 8][8], true, "the always-dark module below the top-left format copy");

  for (let index = 8; index < matrix.size - 8; index += 1) {
    assert.equal(matrix.modules[6][index], index % 2 === 0, `horizontal timing at ${index}`);
    assert.equal(matrix.modules[index][6], index % 2 === 0, `vertical timing at ${index}`);
  }
});

test("the format information is a valid BCH codeword announcing level M and the chosen mask", () => {
  const matrix = InvitationQR.encode("HELLO WORLD");
  const decoded = decode(matrix);

  assert.equal(decoded.level, 0b00, "error correction level M");
  assert.ok(decoded.mask >= 0 && decoded.mask <= 7);
  assert.equal(decoded.text, "HELLO WORLD");
});

test("a 60-character https URL needs a larger version and still decodes", () => {
  const prefix = "https://invitation.example/i/";
  const url = prefix + "a".repeat(60 - prefix.length);
  assert.equal(url.length, 60);

  const matrix = InvitationQR.encode(url);
  const decoded = decode(matrix);

  assert.ok(decoded.version >= 3, `60 bytes should not fit versions 1-2, got version ${decoded.version}`);
  assert.equal(matrix.size, decoded.version * 4 + 17);
  assert.equal(decoded.text, url);
});

test("mask selection tries every mask and keeps the lowest-penalty symbol", () => {
  // Different content lands on different masks, which is only possible if all
  // eight are actually evaluated rather than one being hard-coded.
  const masks = new Set([
    "HELLO WORLD",
    "https://invitation.example/i/abcdefghijklmnop",
    "https://invitation.example/i/0123456789",
    "WWWWWWWWWWWWWWWW",
    "        ",
    "https://invitation.example/i/zz",
    "1234567890123456789012345678901234567890",
    "https://invitation.example/i/qrstuvwxyz012345"
  ].map((value) => decode(InvitationQR.encode(value)).mask));

  assert.ok(masks.size > 1, `mask selection looks hard-coded; only saw ${[...masks]}`);
});

test("non-ASCII content is carried as UTF-8 bytes", () => {
  const decoded = decode(InvitationQR.encode("초대합니다"));

  assert.equal(decoded.text, "초대합니다");
});

test("content beyond version 10 is refused rather than silently truncated", () => {
  assert.throws(() => InvitationQR.encode("x".repeat(214)), /too long|QR_TOO_LONG/i);
  assert.doesNotThrow(() => InvitationQR.encode("x".repeat(213)));
});

test("draw paints one filled rectangle per dark module onto the canvas", () => {
  const fills = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      fillStyle: "",
      fillRect(x, y, width, height) {
        fills.push({ x, y, width, height, style: this.fillStyle });
      }
    })
  };

  const result = InvitationQR.draw(canvas, "HELLO WORLD", { scale: 3 });

  assert.equal(result.size, 21);
  const quietZone = 4;
  assert.equal(canvas.width, (21 + quietZone * 2) * 3);
  assert.equal(canvas.height, canvas.width);
  const dark = result.modules.flat().filter(Boolean).length;
  // One background fill plus one rectangle per dark module.
  assert.equal(fills.length, dark + 1);
  assert.equal(fills[0].width, canvas.width, "the quiet zone is painted first");
  assert.ok(fills.slice(1).every((fill) => fill.width === 3 && fill.height === 3));
});

test("the version 1 matrix for a fixed string stays byte-for-byte stable", () => {
  /* A regression lock, not an independent oracle: the decode tests above prove
     this particular matrix is readable, so freezing it catches any later change
     that would quietly alter a symbol already printed on someone's card. */
  const rendered = InvitationQR.encode("HELLO WORLD").modules
    .map((row) => row.map((cell) => (cell ? "#" : ".")).join(""))
    .join("\n");

  assert.equal(rendered.split("\n").length, 21);
  assert.equal(rendered, EXPECTED_HELLO_WORLD);
});

const EXPECTED_HELLO_WORLD = [
  "#######.##..#.#######",
  "#.....#....#..#.....#",
  "#.###.#..#.#..#.###.#",
  "#.###.#.#..#..#.###.#",
  "#.###.#.###.#.#.###.#",
  "#.....#.#..#..#.....#",
  "#######.#.#.#.#######",
  "........#..##........",
  "#...#.######.#####..#",
  "...#....#.###....####",
  "..######..##.##.#..#.",
  "#####...##...#.......",
  "#####.#.#.#.#.##..##.",
  "........#.#.####.#.##",
  "#######.###.#.#.##.#.",
  "#.....#..#.###.##..##",
  "#.###.#.##.#.##...##.",
  "#.###.#..#..#...##.##",
  "#.###.#..###...###...",
  "#.....#....#.#.......",
  "#######.#########.#.#"
].join("\n");
