import { crc32, deflateRawSync } from 'node:zlib';

export interface ZipEntry { name: string; data: Buffer }

/**
 * Minimal in-memory ZIP writer (deflate, UTF-8 names, fixed 1980 timestamp) so backup/export need no zip dependency.
 * ponytail: no ZIP64 - fails past 65535 entries or 4 GB; stream with a zip library if uploads ever get that big.
 */
export function zip(entries: ZipEntry[]): Buffer {
  if (entries.length > 0xffff) throw new Error('zip: too many entries');
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const deflated = deflateRawSync(e.data);
    const stored = deflated.length >= e.data.length; // incompressible (png/jpg): store as-is
    const body = stored ? e.data : deflated;
    if (offset + body.length > 0xffffffff) throw new Error('zip: archive over 4 GB');
    const crc = crc32(e.data) >>> 0;
    const common = (h: Buffer, at: number) => {
      h.writeUInt16LE(20, at); // version needed
      h.writeUInt16LE(0x0800, at + 2); // flag: UTF-8 names
      h.writeUInt16LE(stored ? 0 : 8, at + 4);
      h.writeUInt16LE(0, at + 6); // time
      h.writeUInt16LE(0x21, at + 8); // date 1980-01-01
      h.writeUInt32LE(crc, at + 10);
      h.writeUInt32LE(body.length, at + 14);
      h.writeUInt32LE(e.data.length, at + 18);
      h.writeUInt16LE(name.length, at + 22);
    };
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    common(local, 4);
    locals.push(local, name, body);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // version made by
    common(cd, 6);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += 30 + name.length + body.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, end]);
}
