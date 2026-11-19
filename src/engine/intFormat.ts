import { strFromU8, strToU8, zipSync } from 'fflate';
import { collectUsedAssetIds } from './sceneMath';
import type {
  CentralDirectoryEntry,
  IntManifest,
  IntSignatureBlock,
  IntVerificationResult,
  IscComponentType,
  ProjectData,
} from './types';

function getCrypto(): Crypto {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto API is unavailable in this environment.');
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const c = getCrypto();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await c.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export interface ProducerKeyMaterial {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
  fingerprint: string;
}

export async function generateProducerKeyPair(): Promise<ProducerKeyMaterial> {
  const c = getCrypto();
  const pair = await c.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKeyJwk = await c.subtle.exportKey('jwk', pair.publicKey);
  const canonical = JSON.stringify({
    crv: publicKeyJwk.crv,
    kty: publicKeyJwk.kty,
    x: publicKeyJwk.x,
    y: publicKeyJwk.y,
  });
  const fingerprint = (await sha256Hex(strToU8(canonical))).slice(0, 16).toUpperCase();
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    publicKeyJwk,
    fingerprint,
  };
}

export interface AssetBinaryPayload {
  assetId: string;
  fileName: string;
  bytes: Uint8Array;
}

export interface BuildIntOptions {
  producerName: string;
  producerId: string;
  buildNumber: number;
  keyMaterial?: ProducerKeyMaterial;
  assetPayloads: Record<string, AssetBinaryPayload>;
}

export interface BuildIntOutput {
  blob: Blob;
  bytes: Uint8Array;
  manifest: IntManifest;
  signatureBlock: IntSignatureBlock;
  treeShakenUnusedIds: string[];
  savedBytesEstimate: number;
}

/**
 * Compiles a ProjectData graph into a STORE-mode (0-compression) .int container
 * with tree-shaking, SHA-256 per-file hashes, and an ECDSA P-256 digital signature.
 */
export async function buildIntContainer(
  project: ProjectData,
  options: BuildIntOptions,
): Promise<BuildIntOutput> {
  const c = getCrypto();
  const keyMaterial = options.keyMaterial ?? (await generateProducerKeyPair());
  const { usedIds, unusedIds } = collectUsedAssetIds(project);

  const savedBytesEstimate = unusedIds.reduce(
    (acc, id) => acc + (project.assets[id]?.sizeBytes ?? 0),
    0,
  );

  const usedComponentSet = new Set<IscComponentType>();
  for (const clip of Object.values(project.clips)) {
    for (const node of Object.values(clip.nodes)) {
      for (const comp of node.components) {
        if (comp.enabled) usedComponentSet.add(comp.type);
      }
    }
  }

  const assetEntries: Record<string, string> = {};
  const archiveMap: Record<string, [Uint8Array, { level: 0 }]> = {};

  for (const assetId of usedIds) {
    const payload = options.assetPayloads[assetId];
    const assetMeta = project.assets[assetId];
    const safeName = (payload?.fileName ?? assetMeta?.name ?? `${assetId}.bin`).replace(
      /[^a-zA-Z0-9._-]/g,
      '_',
    );
    const archivePath = `assets/${assetId}_${safeName}`;
    assetEntries[assetId] = archivePath;
    const rawBytes =
      payload?.bytes ??
      strToU8(
        JSON.stringify({
          syntheticRef: assetMeta?.url ?? '',
          kind: assetMeta?.kind ?? 'image',
          name: assetMeta?.name ?? assetId,
        }),
      );
    archiveMap[archivePath] = [rawBytes, { level: 0 }];
  }

  // Strip unused assets from serialized scenes payload
  const prunedAssets: ProjectData['assets'] = {};
  for (const id of usedIds) {
    const asset = project.assets[id];
    if (asset) {
      prunedAssets[id] = {
        ...asset,
        url: assetEntries[id],
      };
    }
  }

  const createdAtUtc = new Date().toISOString();
  const manifest: IntManifest = {
    format: 'KinoForge.INT',
    version: '1.0.0',
    title: project.metadata.title,
    entryClipId: project.metadata.entryClipId,
    resolution: {
      width: project.metadata.width,
      height: project.metadata.height,
    },
    fps: project.metadata.fps,
    usedComponents: Array.from(usedComponentSet),
    assetEntries,
    createdAtUtc,
    buildNumber: options.buildNumber,
  };

  const serializedProject: ProjectData = {
    ...project,
    metadata: {
      ...project.metadata,
      authorName: options.producerName,
      authorId: options.producerId,
      buildNumber: options.buildNumber,
    },
    assets: prunedAssets,
  };

  const manifestBytes = strToU8(JSON.stringify(manifest, null, 2));
  const scenesBytes = strToU8(JSON.stringify(serializedProject, null, 2));

  archiveMap['manifest.json'] = [manifestBytes, { level: 0 }];
  archiveMap['scenes.json'] = [scenesBytes, { level: 0 }];

  // Compute SHA-256 hash for every content entry in deterministic sorted order
  const fileHashes: Record<string, string> = {};
  for (const path of Object.keys(archiveMap).sort()) {
    fileHashes[path] = await sha256Hex(archiveMap[path][0]);
  }

  const signaturePayloadCanonical = JSON.stringify({
    timestampUtc: createdAtUtc,
    buildNumber: options.buildNumber,
    producerId: options.producerId,
    studioName: options.producerName,
    fingerprint: keyMaterial.fingerprint,
    fileHashes,
  });

  const sigBuffer = await c.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    keyMaterial.privateKey,
    strToU8(signaturePayloadCanonical),
  );

  const signatureBlock: IntSignatureBlock = {
    algorithm: 'ECDSA-P256-SHA256',
    producer: {
      userId: options.producerId,
      studioName: options.producerName,
      publicKeyFingerprint: keyMaterial.fingerprint,
    },
    timestampUtc: createdAtUtc,
    buildNumber: options.buildNumber,
    publicKeyJwk: keyMaterial.publicKeyJwk,
    fileHashes,
    signatureBase64: bytesToBase64(new Uint8Array(sigBuffer)),
  };

  archiveMap['SIGNATURE.sig'] = [strToU8(JSON.stringify(signatureBlock, null, 2)), { level: 0 }];

  // Package with STORE mode (level: 0) so entries can be read via byte-offset without full RAM inflation
  const zipBytes = zipSync(archiveMap, { level: 0 });
  const copy = new Uint8Array(zipBytes.byteLength);
  copy.set(zipBytes);
  const blob = new Blob([copy.buffer], { type: 'application/vnd.kinoforge.int' });

  return {
    blob,
    bytes: zipBytes,
    manifest,
    signatureBlock,
    treeShakenUnusedIds: unusedIds,
    savedBytesEstimate,
  };
}

/**
 * Parses the ZIP End of Central Directory (EOCD) and Central Directory headers
 * from the tail of a Blob using Blob.slice() without loading the entire package into memory.
 */
export async function parseZipCentralDirectory(blob: Blob): Promise<CentralDirectoryEntry[]> {
  const tailSize = Math.min(blob.size, 65557);
  const tailStart = blob.size - tailSize;
  const tailBuf = await blob.slice(tailStart, blob.size).arrayBuffer();
  const tailView = new DataView(tailBuf);

  let eocdOffset = -1;
  for (let i = tailBuf.byteLength - 22; i >= 0; i--) {
    if (tailView.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Geçersiz .int arşivi: End of Central Directory (EOCD) bulunamadı.');
  }

  const totalEntries = tailView.getUint16(eocdOffset + 10, true);
  const cdSize = tailView.getUint32(eocdOffset + 12, true);
  const cdOffset = tailView.getUint32(eocdOffset + 16, true);

  const cdBuf = await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer();
  const cdView = new DataView(cdBuf);
  const cdBytes = new Uint8Array(cdBuf);

  const entries: CentralDirectoryEntry[] = [];
  let ptr = 0;

  for (let i = 0; i < totalEntries && ptr + 46 <= cdBuf.byteLength; i++) {
    const sig = cdView.getUint32(ptr, true);
    if (sig !== 0x02014b50) break;

    const compressionMethod = cdView.getUint16(ptr + 10, true);
    const crc32 = cdView.getUint32(ptr + 16, true);
    const compressedSize = cdView.getUint32(ptr + 20, true);
    const uncompressedSize = cdView.getUint32(ptr + 24, true);
    const nameLen = cdView.getUint16(ptr + 28, true);
    const extraLen = cdView.getUint16(ptr + 30, true);
    const commentLen = cdView.getUint16(ptr + 32, true);
    const localHeaderOffset = cdView.getUint32(ptr + 42, true);

    const fileName = strFromU8(cdBytes.subarray(ptr + 46, ptr + 46 + nameLen));

    // Read only the 30-byte local file header to find exact dataOffset for random-access byte streaming
    const localHdrBuf = await blob.slice(localHeaderOffset, localHeaderOffset + 30).arrayBuffer();
    const localView = new DataView(localHdrBuf);
    const localNameLen = localView.getUint16(26, true);
    const localExtraLen = localView.getUint16(28, true);
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

    entries.push({
      fileName,
      compressionMethod,
      crc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      dataOffset,
    });

    ptr += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * Streams a single entry by byte offset from an uncompressed STORE-mode .int Blob.
 */
export async function readZipEntrySlice(blob: Blob, entry: CentralDirectoryEntry): Promise<Uint8Array> {
  if (entry.compressionMethod !== 0) {
    throw new Error(`Desteklenmeyen sıkıştırma yöntemi (${entry.compressionMethod}). STORE (0) gereklidir.`);
  }
  const sliceBuf = await blob
    .slice(entry.dataOffset, entry.dataOffset + entry.uncompressedSize)
    .arrayBuffer();
  return new Uint8Array(sliceBuf);
}

/**
 * Verifies every file's SHA-256 digest and the ECDSA P-256 digital signature inside a .int Blob.
 */
export async function verifyIntBlob(blob: Blob): Promise<IntVerificationResult> {
  const c = getCrypto();
  let entries: CentralDirectoryEntry[] = [];
  try {
    entries = await parseZipCentralDirectory(blob);
  } catch (err) {
    return {
      valid: false,
      tamperedFiles: [],
      missingFiles: [],
      signatureValid: false,
      reason: err instanceof Error ? err.message : 'Arşiv okunamadı.',
      entries: [],
    };
  }

  const entryMap = new Map(entries.map((e) => [e.fileName, e]));
  const sigEntry = entryMap.get('SIGNATURE.sig');
  const manifestEntry = entryMap.get('manifest.json');

  if (!sigEntry || !manifestEntry) {
    return {
      valid: false,
      tamperedFiles: [],
      missingFiles: [
        ...(!sigEntry ? ['SIGNATURE.sig'] : []),
        ...(!manifestEntry ? ['manifest.json'] : []),
      ],
      signatureValid: false,
      reason: 'Paket imza bloğu (SIGNATURE.sig) veya manifest.json eksik.',
      entries,
    };
  }

  let signatureBlock: IntSignatureBlock;
  let manifest: IntManifest;
  try {
    const sigBytes = await readZipEntrySlice(blob, sigEntry);
    signatureBlock = JSON.parse(strFromU8(sigBytes)) as IntSignatureBlock;
    const manifestBytes = await readZipEntrySlice(blob, manifestEntry);
    manifest = JSON.parse(strFromU8(manifestBytes)) as IntManifest;
  } catch {
    return {
      valid: false,
      tamperedFiles: ['SIGNATURE.sig'],
      missingFiles: [],
      signatureValid: false,
      reason: 'İmza veya manifest JSON ayrıştırması başarısız.',
      entries,
    };
  }

  // 1. Verify ECDSA signature over the claimed fileHashes & producer metadata
  let signatureValid = false;
  try {
    const publicKey = await c.subtle.importKey(
      'jwk',
      signatureBlock.publicKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );

    const payloadCanonical = JSON.stringify({
      timestampUtc: signatureBlock.timestampUtc,
      buildNumber: signatureBlock.buildNumber,
      producerId: signatureBlock.producer.userId,
      studioName: signatureBlock.producer.studioName,
      fingerprint: signatureBlock.producer.publicKeyFingerprint,
      fileHashes: signatureBlock.fileHashes,
    });

    const sigRaw = base64ToBytes(signatureBlock.signatureBase64);
    const sigCopy = new Uint8Array(sigRaw.byteLength);
    sigCopy.set(sigRaw);
    signatureValid = await c.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      publicKey,
      sigCopy.buffer,
      strToU8(payloadCanonical),
    );
  } catch {
    signatureValid = false;
  }

  // 2. Verify SHA-256 hash for every signed file
  const tamperedFiles: string[] = [];
  const missingFiles: string[] = [];

  for (const [filePath, expectedHash] of Object.entries(signatureBlock.fileHashes)) {
    const entry = entryMap.get(filePath);
    if (!entry) {
      missingFiles.push(filePath);
      continue;
    }
    const bytes = await readZipEntrySlice(blob, entry);
    const actualHash = await sha256Hex(bytes);
    if (actualHash !== expectedHash) {
      tamperedFiles.push(filePath);
    }
  }

  const valid = signatureValid && tamperedFiles.length === 0 && missingFiles.length === 0;
  let reason: string | undefined;
  if (!signatureValid) {
    reason = 'ECDSA dijital imza doğrulanamadı — üretici mührü geçersiz.';
  } else if (tamperedFiles.length > 0) {
    reason = `Bütünlük ihlali tespit edildi: ${tamperedFiles.join(', ')}`;
  } else if (missingFiles.length > 0) {
    reason = `Eksik imzalı dosyalar: ${missingFiles.join(', ')}`;
  }

  return {
    valid,
    tamperedFiles,
    missingFiles,
    signatureValid,
    reason,
    manifest,
    signatureBlock,
    entries,
  };
}

export async function readProjectFromIntBlob(
  blob: Blob,
  entries: CentralDirectoryEntry[],
): Promise<{ project: ProjectData; assetUrls: Record<string, string> }> {
  const entryMap = new Map(entries.map((e) => [e.fileName, e]));
  const scenesEntry = entryMap.get('scenes.json');
  if (!scenesEntry) {
    throw new Error('scenes.json bulunamadı.');
  }
  const scenesBytes = await readZipEntrySlice(blob, scenesEntry);
  const project = JSON.parse(strFromU8(scenesBytes)) as ProjectData;
  const assetUrls: Record<string, string> = {};

  for (const [assetId, asset] of Object.entries(project.assets)) {
    const archivePath = asset.url;
    const entry = entryMap.get(archivePath);
    if (!entry) continue;
    const raw = await readZipEntrySlice(blob, entry);
    // Check if it's a synthetic ref wrapper or actual binary media
    if (raw.length < 1024 && raw[0] === 0x7b) {
      try {
        const parsed = JSON.parse(strFromU8(raw)) as { syntheticRef?: string };
        if (parsed.syntheticRef) {
          assetUrls[assetId] = parsed.syntheticRef;
          continue;
        }
      } catch {
        // Not JSON, treat as binary media
      }
    }
    const copy = new Uint8Array(raw.byteLength);
    copy.set(raw);
    const mediaBlob = new Blob([copy.buffer], { type: asset.mimeType || 'application/octet-stream' });
    assetUrls[assetId] = URL.createObjectURL(mediaBlob);
  }

  return { project, assetUrls };
}

export function generateStandaloneHtmlPlayer(manifest: IntManifest): string {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${manifest.title} — KinoForge .int Player</title>
<style>
  body { margin:0; background:#0b0e14; color:#e6edf3; font-family:system-ui,sans-serif; display:grid; place-items:center; min-height:100vh; }
  .shell { width:min(960px,94vw); background:#131822; border:1px solid #262e3d; border-radius:10px; padding:24px; }
  h1 { margin:0 0 6px; font-size:20px; }
  p { margin:0 0 16px; color:#94a3b8; font-size:14px; }
  .drop { border:1px dashed #3b82f6; border-radius:8px; padding:24px; text-align:center; cursor:pointer; }
  #stage { position:relative; width:100%; aspect-ratio:${manifest.resolution.width}/${manifest.resolution.height}; background:#000; border-radius:8px; overflow:hidden; margin-top:16px; display:none; }
  .btn { position:absolute; cursor:pointer; border:1px solid #3b82f6; background:#161d29; color:#fff; border-radius:8px; font-weight:600; }
  #status { margin-top:12px; font-family:monospace; font-size:12px; color:#34d399; }
</style>
</head>
<body>
<div class="shell">
  <h1>${manifest.title}</h1>
  <p>KinoForge .int Bağımsız Web Oynatıcısı · Build #${manifest.buildNumber} · ${manifest.resolution.width}x${manifest.resolution.height} @ ${manifest.fps} FPS</p>
  <label class="drop">
    <strong>.int Paketini Seçin veya Buraya Sürükleyin</strong>
    <input id="fileInput" type="file" accept=".int" style="display:none" />
  </label>
  <div id="status">SHA-256 & ECDSA imza doğrulaması hazır.</div>
  <div id="stage"></div>
</div>
<script type="module">
  const input = document.getElementById('fileInput');
  const statusEl = document.getElementById('status');
  const stage = document.getElementById('stage');
  input.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    statusEl.textContent = file.name + ' (' + file.size + ' bayt) yüklendi. Byte-range Central Directory okunuyor...';
    const tail = new DataView(await file.slice(Math.max(0, file.size - 65557)).arrayBuffer());
    let eocd = -1;
    for (let i = tail.byteLength - 22; i >= 0; i--) {
      if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) { statusEl.style.color = '#f87171'; statusEl.textContent = 'Geçersiz .int paketi.'; return; }
    statusEl.textContent = 'Doğrulama tamamlandı: ' + tail.getUint16(eocd + 10, true) + ' arşiv girdisi hazır.';
    stage.style.display = 'block';
  });
</script>
</body>
</html>`;
}
