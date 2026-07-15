/**
 * 测试辅助工具
 * 生成合法的 PNG 图片 buffer 和 MP4 视频缓冲，供 API 测试使用
 */
import zlib from 'zlib';

/**
 * 生成合法的 PNG buffer（灰度图，color type 0, bit depth 8）
 *
 * @param width  图片宽度（像素）
 * @param height 图片高度（像素）
 * @returns 合法的 PNG 文件 buffer
 */
export function makePngBuffer(width: number, height: number): Buffer {
  // PNG 签名
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR 数据：width(4) + height(4) + bitDepth(1) + colorType(1) + compression(1) + filter(1) + interlace(1)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 0; // color type: grayscale
  ihdrData[10] = 0; // compression: deflate
  ihdrData[11] = 0; // filter: adaptive
  ihdrData[12] = 0; // interlace: none

  // 图像原始数据：每行 = 1 字节 filter(0) + width 字节像素
  const rowLength = 1 + width;
  const rawData = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowLength;
    rawData[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      rawData[rowStart + 1 + x] = (x + y) % 256; // 灰度像素值
    }
  }

  const compressed = zlib.deflateSync(rawData);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * 生成符合全景图比例（2:1）的合法 PNG buffer
 */
export function makePanoramicPng(baseSize = 200): Buffer {
  return makePngBuffer(baseSize * 2, baseSize);
}

/**
 * 生成非全景图比例（如 1:1）的合法 PNG buffer
 */
export function makeNonPanoramicPng(size = 100): Buffer {
  return makePngBuffer(size, size);
}

/**
 * 构造 PNG chunk: length(4) + type(4) + data + CRC(4)
 */
function makeChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = zlib.crc32(crcInput);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

// ────────────────── MP4 视频 ──────────────────

/**
 * 生成包含 moov/mvhd 的最小 MP4 buffer
 * 仅包含 ftyp + moov(mvhd)，不含实际媒体数据，
 * 但足以让后端 videoDuration 解析器读取时长
 *
 * @param durationSeconds 视频时长（秒）
 * @returns 最小合法 MP4 buffer
 */
export function makeMp4Buffer(durationSeconds: number): Buffer {
  const timescale = 1000; // 1 tick = 1ms
  const duration = Math.round(durationSeconds * timescale);

  // mvhd box (version 0): 100 bytes data
  const mvhdData = Buffer.alloc(100);
  mvhdData[0] = 0; // version
  mvhdData.writeUInt32BE(0, 1); // flags
  mvhdData.writeUInt32BE(0, 4); // creation_time
  mvhdData.writeUInt32BE(0, 8); // modification_time
  mvhdData.writeUInt32BE(timescale, 12); // timescale
  mvhdData.writeUInt32BE(duration, 16); // duration
  mvhdData.writeUInt32BE(0x00010000, 20); // rate = 1.0
  mvhdData.writeUInt16BE(0x0100, 24); // volume = 1.0
  // reserved(10) + matrix(36) + pre_defined(24) 已为 0
  mvhdData.writeUInt32BE(1, 96); // next_track_ID

  const mvhdBox = makeMp4Box('mvhd', mvhdData);
  const moovBox = makeMp4Box('moov', mvhdBox);

  // ftyp box
  const ftypData = Buffer.alloc(8);
  ftypData.write('isom', 0, 'ascii'); // major brand
  ftypData.writeUInt32BE(0x0200, 4); // minor version
  const ftypBox = makeMp4Box('ftyp', Buffer.concat([ftypData, Buffer.from('isom', 'ascii')]));

  return Buffer.concat([ftypBox, moovBox]);
}

/**
 * 生成符合时长要求（≥ 10 秒）的 MP4 buffer
 */
export function makeValidMp4(durationSeconds = 15): Buffer {
  return makeMp4Buffer(durationSeconds);
}

/**
 * 生成不符合时长要求（< 10 秒）的 MP4 buffer
 */
export function makeShortMp4(durationSeconds = 5): Buffer {
  return makeMp4Buffer(durationSeconds);
}

/**
 * 构造 MP4 box: size(4) + type(4) + data
 */
function makeMp4Box(type: string, data: Buffer): Buffer {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(8 + data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  return Buffer.concat([size, typeBuf, data]);
}
