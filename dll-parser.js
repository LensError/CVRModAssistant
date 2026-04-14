// dll-parser.js
// Reads MelonInfoAttribute / MelonModInfoAttribute from .NET DLL files.
// Format reference: ECMA-335 Common Language Infrastructure specification.

'use strict';
const fs = require('fs');

/**
 * Parse a MelonLoader mod DLL and return its MelonInfo metadata.
 * @param {string} dllPath - Absolute path to the .dll file
 * @returns {{ name: string|null, version: string|null, author: string|null } | null}
 */
function parseMelonInfo(dllPath) {
    try {
        const buf = fs.readFileSync(dllPath);
        return _extractMelonInfo(buf);
    } catch {
        return null;
    }
}

function _extractMelonInfo(buf) {
    // ── 1. Parse PE headers ───────────────────────────────────────────────────
    if (buf.length < 0x40) return null;
    if (buf.readUInt16LE(0) !== 0x5A4D) return null; // 'MZ' signature

    const peOff = buf.readUInt32LE(0x3C);
    if (buf.readUInt32LE(peOff) !== 0x00004550) return null; // 'PE\0\0'

    const coffOff = peOff + 4;
    const numSects = buf.readUInt16LE(coffOff + 2);
    const optHdrOff = coffOff + 20;
    const optHdrSize = buf.readUInt16LE(coffOff + 16);
    const sectsOff = optHdrOff + optHdrSize;

    const isPE32Plus = buf.readUInt16LE(optHdrOff) === 0x20B;

    // DataDirectory[14] = CLR runtime header (COM descriptor)
    const ddBase = optHdrOff + (isPE32Plus ? 112 : 96);
    const clrRVA = buf.readUInt32LE(ddBase + 14 * 8);
    if (clrRVA === 0) return null; // not a .NET assembly

    // RVA → file offset via section table
    function rvaToOff(rva) {
        for (let i = 0; i < numSects; i++) {
            const sh = sectsOff + i * 40;
            const vAddr = buf.readUInt32LE(sh + 12);
            const vSize = buf.readUInt32LE(sh + 8);
            const rOff = buf.readUInt32LE(sh + 20);
            const rSize = buf.readUInt32LE(sh + 16);
            if (rva >= vAddr && rva < vAddr + Math.max(vSize, rSize))
                return rOff + (rva - vAddr);
        }
        return -1;
    }

    // ── 2. CLR header → CLI metadata root ────────────────────────────────────
    const clrOff = rvaToOff(clrRVA);
    if (clrOff < 0) return null;

    const mdRVA = buf.readUInt32LE(clrOff + 8); // IMAGE_COR20_HEADER.MetaData.VirtualAddress
    const mdOff = rvaToOff(mdRVA);
    if (mdOff < 0) return null;

    // ── 3. Metadata root: find #~, #Strings, #Blob streams ───────────────────
    if (buf.readUInt32LE(mdOff) !== 0x424A5342) return null; // 'BSJB'

    // Version string length (already padded to 4-byte boundary)
    const verLen = buf.readUInt32LE(mdOff + 12);
    // Layout after signature: sig(4) + major(2) + minor(2) + reserved(4) + length(4) + version(verLen) + flags(2) + streams(2)
    const numStreams = buf.readUInt16LE(mdOff + 16 + verLen + 2);

    let tablesOff = -1, stringsOff = -1, blobOff = -1, stringsSize = 0;

    let shp = mdOff + 16 + verLen + 4; // first stream header
    for (let i = 0; i < numStreams; i++) {
        const stOff = buf.readUInt32LE(shp);
        const stSize = buf.readUInt32LE(shp + 4);
        let nameEnd = shp + 8;
        while (buf[nameEnd] !== 0) nameEnd++;
        const name = buf.toString('ascii', shp + 8, nameEnd);
        const nameRaw = nameEnd - shp - 8 + 1; // byte count including null terminator
        shp += 8 + Math.ceil(nameRaw / 4) * 4; // advance past padded name

        const abs = mdOff + stOff;
        if (name === '#~' || name === '#-') { tablesOff = abs; }
        else if (name === '#Strings') { stringsOff = abs; stringsSize = stSize; }
        else if (name === '#Blob') { blobOff = abs; }
    }
    if (tablesOff < 0 || stringsOff < 0 || blobOff < 0) return null;

    // ── 4. Tables stream header ───────────────────────────────────────────────
    // Layout: reserved(4) + major(1) + minor(1) + heapSizes(1) + reserved2(1) + valid(8) + sorted(8) + rows...
    const heapSizes = buf[tablesOff + 6];
    const strIdxSz = (heapSizes & 0x01) ? 4 : 2;
    const guidIdxSz = (heapSizes & 0x02) ? 4 : 2;
    const blobIdxSz = (heapSizes & 0x04) ? 4 : 2;
    const validMask = buf.readBigUInt64LE(tablesOff + 8);

    // Row counts (one uint32 per present table, in table-number order)
    const rc = new Int32Array(64);
    let rcOff = tablesOff + 24;
    for (let t = 0; t < 64; t++) {
        if (validMask & (1n << BigInt(t))) {
            rc[t] = buf.readUInt32LE(rcOff);
            rcOff += 4;
        }
    }
    const tableDataStart = rcOff;

    // Coded index width helpers (ECMA-335 §II.24.2.6)
    function ciSz(tagBits, ...tables) {
        const max = Math.max(0, ...tables.map(t => rc[t]));
        return max < (1 << (16 - tagBits)) ? 2 : 4;
    }
    function siSz(t) { return rc[t] > 0xFFFF ? 4 : 2; } // simple (single-table) index

    // Pre-compute coded index sizes needed for row-size expressions
    const rsSz = ciSz(2, 0x00, 0x1A, 0x23, 0x01);                   // ResolutionScope
    const tdorSz = ciSz(2, 0x02, 0x01, 0x1B);                          // TypeDefOrRef
    const mrpSz = ciSz(3, 0x02, 0x01, 0x1A, 0x06, 0x1B);             // MemberRefParent
    const hcaSz = ciSz(5,
        0x06, 0x04, 0x01, 0x02, 0x08, 0x09, 0x0A, 0x00, 0x0E,         // HasCustomAttribute
        0x17, 0x14, 0x11, 0x1A, 0x1B, 0x20, 0x23, 0x26, 0x27,
        0x28, 0x2A, 0x2C, 0x2B);
    const hcatSz = ciSz(3, 0x06, 0x0A);                                // HasCustomAttributeType
    const mdrSz = ciSz(1, 0x06, 0x0A);                                // MethodDefOrRef
    const hcsSz = ciSz(2, 0x04, 0x08, 0x17);                          // HasConstant
    const hfmSz = ciSz(1, 0x04, 0x08);                                // HasFieldMarshal
    const hdsSz = ciSz(2, 0x02, 0x06, 0x20);                          // HasDeclSecurity
    const hsmSz = ciSz(1, 0x14, 0x17);                                // HasSemantics
    const mfwdSz = ciSz(1, 0x04, 0x06);                                // MemberForwarded
    const implSz = ciSz(2, 0x26, 0x23, 0x27);                          // Implementation
    const tomdSz = ciSz(1, 0x02, 0x06);                                // TypeOrMethodDef

    // Row sizes for all standard ECMA-335 tables
    const ROW_SIZES = {
        0x00: 2 + strIdxSz + guidIdxSz * 3,                                               // Module
        0x01: rsSz + strIdxSz + strIdxSz,                                                 // TypeRef
        0x02: 4 + strIdxSz + strIdxSz + tdorSz + siSz(0x04) + siSz(0x06),                // TypeDef
        0x04: 2 + strIdxSz + blobIdxSz,                                                   // Field
        0x06: 4 + 2 + 2 + strIdxSz + blobIdxSz + siSz(0x08),                             // MethodDef
        0x08: 2 + 2 + strIdxSz,                                                           // Param
        0x09: siSz(0x02) + tdorSz,                                                        // InterfaceImpl
        0x0A: mrpSz + strIdxSz + blobIdxSz,                                               // MemberRef
        0x0B: 2 + hcsSz + blobIdxSz,                                                     // Constant
        0x0C: hcaSz + hcatSz + blobIdxSz,                                                 // CustomAttribute
        0x0D: hfmSz + blobIdxSz,                                                          // FieldMarshal
        0x0E: 2 + hdsSz + blobIdxSz,                                                     // DeclSecurity
        0x0F: 2 + 4 + siSz(0x02),                                                        // ClassLayout
        0x10: 4 + siSz(0x04),                                                             // FieldLayout
        0x11: blobIdxSz,                                                                  // StandAloneSig
        0x12: siSz(0x02) + siSz(0x14),                                                   // EventMap
        0x14: 2 + strIdxSz + tdorSz,                                                     // Event
        0x15: siSz(0x02) + siSz(0x17),                                                   // PropertyMap
        0x17: 2 + strIdxSz + blobIdxSz,                                                  // Property
        0x18: 2 + siSz(0x06) + hsmSz,                                                    // MethodSemantics
        0x19: siSz(0x02) + mdrSz + mdrSz,                                                // MethodImpl
        0x1A: strIdxSz,                                                                   // ModuleRef
        0x1B: blobIdxSz,                                                                  // TypeSpec
        0x1C: 2 + mfwdSz + strIdxSz + siSz(0x1A),                                       // ImplMap
        0x1D: 4 + siSz(0x04),                                                            // FieldRVA
        0x20: 4 + 2 + 2 + 2 + 2 + 4 + blobIdxSz + strIdxSz + strIdxSz,                 // Assembly
        0x21: 4,                                                                          // AssemblyProcessor (obsolete)
        0x22: 4 + 4 + 4,                                                                 // AssemblyOS (obsolete)
        0x23: 2 + 2 + 2 + 2 + 4 + blobIdxSz + strIdxSz + strIdxSz + blobIdxSz,         // AssemblyRef
        0x24: 4 + siSz(0x23),                                                            // AssemblyRefProcessor (obsolete)
        0x25: 4 + 4 + 4 + siSz(0x23),                                                   // AssemblyRefOS (obsolete)
        0x26: 4 + strIdxSz + blobIdxSz,                                                  // File
        0x27: 4 + 4 + strIdxSz + strIdxSz + implSz,                                     // ExportedType
        0x28: 4 + 4 + strIdxSz + implSz,                                                 // ManifestResource
        0x29: siSz(0x02) + siSz(0x02),                                                   // NestedClass
        0x2A: 2 + 2 + tomdSz + strIdxSz,                                                 // GenericParam
        0x2B: mdrSz + blobIdxSz,                                                         // MethodSpec
        0x2C: siSz(0x2A) + tdorSz,                                                       // GenericParamConstraint
    };

    // Compute absolute file offset of each table
    const tblOff = {};
    let cur = tableDataStart;
    for (let t = 0; t < 64; t++) {
        if (rc[t] > 0) {
            if (!(t in ROW_SIZES)) return null; // unknown table — can't compute further offsets
            tblOff[t] = cur;
            cur += rc[t] * ROW_SIZES[t];
        }
    }

    // Heap read helpers
    function rdIdx(off, sz) {
        return sz === 4 ? buf.readUInt32LE(off) : buf.readUInt16LE(off);
    }

    function getString(idx) {
        if (idx === 0) return '';
        let end = stringsOff + idx;
        while (end < stringsOff + stringsSize && buf[end] !== 0) end++;
        return buf.toString('utf8', stringsOff + idx, end);
    }

    function readCompressedUInt(b, p) {
        const b0 = b[p];
        if ((b0 & 0x80) === 0) return [b0, 1];
        if ((b0 & 0xC0) === 0x80) return [((b0 & 0x3F) << 8) | b[p + 1], 2];
        return [((b0 & 0x1F) << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3], 4];
    }

    function getBlob(idx) {
        if (idx === 0) return Buffer.alloc(0);
        const start = blobOff + idx;
        const [len, adv] = readCompressedUInt(buf, start);
        return buf.slice(start + adv, start + adv + len);
    }

    // ── 5. TypeRef table: find rows for MelonInfoAttribute / MelonModInfoAttribute ──
    const TARGET_NAMES = new Set(['MelonInfoAttribute', 'MelonModInfoAttribute']);
    const trSz = ROW_SIZES[0x01];
    const trCount = rc[0x01] || 0;

    const targetTypeRefs = [];
    for (let i = 1; i <= trCount; i++) {
        const off = tblOff[0x01] + (i - 1) * trSz;
        const nameIdx = rdIdx(off + rsSz, strIdxSz);
        if (TARGET_NAMES.has(getString(nameIdx))) targetTypeRefs.push(i);
    }
    if (targetTypeRefs.length === 0) return null;

    // ── 6. MemberRef table: find .ctor on those types ─────────────────────────
    const mrSz = ROW_SIZES[0x0A];
    const mrCount = rc[0x0A] || 0;

    const targetMRefs = [];
    for (let i = 1; i <= mrCount; i++) {
        const off = tblOff[0x0A] + (i - 1) * mrSz;
        const classRaw = rdIdx(off, mrpSz);
        // MemberRefParent tag 1 = TypeRef
        if ((classRaw & 0x07) !== 1) continue;
        if (!targetTypeRefs.includes(classRaw >> 3)) continue;
        const nameIdx = rdIdx(off + mrpSz, strIdxSz);
        if (getString(nameIdx) === '.ctor') targetMRefs.push(i);
    }
    if (targetMRefs.length === 0) return null;

    // ── 7. CustomAttribute table: find attribute applied to the Assembly row ──
    // Assembly = table 0x20, row index 1.
    // HasCustomAttribute coded index for Assembly: tag = 14 (5-bit), row 1
    // Encoded value = (1 << 5) | 14 = 46
    const ASSEMBLY_PARENT = (1 << 5) | 14;
    const caSz = ROW_SIZES[0x0C];
    const caCount = rc[0x0C] || 0;

    for (let i = 1; i <= caCount; i++) {
        const off = tblOff[0x0C] + (i - 1) * caSz;
        if (rdIdx(off, hcaSz) !== ASSEMBLY_PARENT) continue;

        const typeRaw = rdIdx(off + hcaSz, hcatSz);
        // HasCustomAttributeType tag 3 = MemberRef
        if ((typeRaw & 0x07) !== 3) continue;
        if (!targetMRefs.includes(typeRaw >> 3)) continue;

        // ── 8. Parse the custom attribute value blob ───────────────────────
        // ECMA-335 §II.23.3: Prolog(2) FixedArgs NamedArgs(2)
        // FixedArgs for MelonInfoAttribute(Type type, string name, string version, string author, string downloadLink?)
        //   [0] SerString — assembly-qualified type name
        //   [1] SerString — mod name
        //   [2] SerString — mod version
        //   [3] SerString — author
        //   [4] SerString — download link (optional)
        const blobIdx = rdIdx(off + hcaSz + hcatSz, blobIdxSz);
        const blob = getBlob(blobIdx);
        if (blob.length < 4) continue;
        if (blob[0] !== 0x01 || blob[1] !== 0x00) continue; // bad prolog

        let pos = 2;
        const args = [];
        while (pos < blob.length - 2 && args.length < 5) {
            if (blob[pos] === 0xFF) {
                // null SerString
                args.push(null);
                pos++;
                continue;
            }
            if (pos >= blob.length) break;
            const [len, adv] = readCompressedUInt(blob, pos);
            if (pos + adv + len > blob.length) break; // out-of-bounds guard
            pos += adv;
            args.push(blob.toString('utf8', pos, pos + len));
            pos += len;
        }

        // args indices: [0]=Type, [1]=name, [2]=version, [3]=author
        if (args.length >= 3) {
            return {
                name: args[1] || null,
                version: args[2] || null,
                author: args[3] || null,
            };
        }
    }

    return null;
}

module.exports = { parseMelonInfo };
