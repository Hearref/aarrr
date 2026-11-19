import type { AssetItem, AssetKind } from '../engine/types';

export function isOpfsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

export function inferAssetKind(mimeType: string, fileName: string): AssetKind | null {
  const lower = fileName.toLowerCase();
  if (mimeType.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/.test(lower)) return 'video';
  if (mimeType.startsWith('audio/') || /\.(mp3|wav|ogg|aac|m4a|flac)$/.test(lower)) return 'audio';
  if (mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/.test(lower)) return 'image';
  return null;
}

export function generateSyntheticWaveform(seed: number, length = 64): number[] {
  const peaks: number[] = [];
  let s = seed || 1337;
  for (let i = 0; i < length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const base = 0.25 + ((s % 1000) / 1000) * 0.65;
    const envelope = Math.sin((i / length) * Math.PI);
    peaks.push(Number((base * (0.45 + 0.55 * envelope)).toFixed(3)));
  }
  return peaks;
}

async function extractImageMetadata(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1280, height: img.naturalHeight || 720 });
    img.onerror = () => resolve({ width: 1280, height: 720 });
    img.src = url;
  });
}

async function extractVideoMetadata(
  url: string,
): Promise<{ width: number; height: number; durationMs: number; fps: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const timeout = window.setTimeout(() => {
      resolve({ width: 1280, height: 720, durationMs: 6000, fps: 30 });
    }, 2500);
    video.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      resolve({
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720,
        durationMs: Math.max(1000, Math.round((video.duration || 6) * 1000)),
        fps: 30,
      });
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      resolve({ width: 1280, height: 720, durationMs: 6000, fps: 30 });
    };
    video.src = url;
  });
}

async function extractAudioMetadata(
  bytes: Uint8Array,
): Promise<{ durationMs: number; waveform: number[] }> {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return { durationMs: 5000, waveform: generateSyntheticWaveform(bytes.length, 64) };
    }
    const ctx = new AudioCtx();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const audioBuf = await ctx.decodeAudioData(copy.buffer);
    const ch = audioBuf.getChannelData(0);
    const bars = 64;
    const blockSize = Math.max(1, Math.floor(ch.length / bars));
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      const start = i * blockSize;
      for (let j = 0; j < blockSize && start + j < ch.length; j += Math.max(1, Math.floor(blockSize / 16))) {
        const v = Math.abs(ch[start + j]);
        if (v > max) max = v;
      }
      peaks.push(Number(Math.min(1, Math.max(0.08, max)).toFixed(3)));
    }
    const durationMs = Math.max(500, Math.round(audioBuf.duration * 1000));
    await ctx.close();
    return { durationMs, waveform: peaks };
  } catch {
    return { durationMs: 5000, waveform: generateSyntheticWaveform(bytes.length, 64) };
  }
}

async function writeToOpfs(folder: string, fileName: string, bytes: Uint8Array): Promise<string | undefined> {
  if (!isOpfsSupported()) return undefined;
  try {
    const root = await navigator.storage.getDirectory();
    const cleanSegments = ['kinoforge', ...folder.split('/').filter(Boolean)];
    let dir = root;
    for (const seg of cleanSegments) {
      dir = await dir.getDirectoryHandle(seg, { create: true });
    }
    const handle = await dir.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    await writable.write(copy.buffer);
    await writable.close();
    return `${folder.replace(/\/$/, '')}/${fileName}`;
  } catch {
    return undefined;
  }
}

export async function importFileIntoWorkspace(
  file: File,
  folder: string,
): Promise<{ asset: AssetItem; bytes: Uint8Array } | null> {
  const kind = inferAssetKind(file.type, file.name);
  if (!kind) return null;

  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const blob = new Blob([bytes], { type: file.type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const opfsPath = await writeToOpfs(folder, file.name, bytes);

  const id = `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const asset: AssetItem = {
    id,
    name: file.name,
    folder,
    kind,
    mimeType: file.type || (kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mpeg' : 'image/png'),
    sizeBytes: file.size,
    url,
    opfsPath,
  };

  if (kind === 'image') {
    const dims = await extractImageMetadata(url);
    asset.width = dims.width;
    asset.height = dims.height;
    asset.durationMs = 5000;
  } else if (kind === 'video') {
    const meta = await extractVideoMetadata(url);
    asset.width = meta.width;
    asset.height = meta.height;
    asset.durationMs = meta.durationMs;
    asset.fps = meta.fps;
  } else if (kind === 'audio') {
    const meta = await extractAudioMetadata(bytes);
    asset.durationMs = meta.durationMs;
    asset.waveform = meta.waveform;
  }

  return { asset, bytes };
}

export async function pickLocalDirectoryAssets(
  targetFolder: string,
): Promise<{ assets: { asset: AssetItem; bytes: Uint8Array }[]; folderName: string }> {
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> })
    .showDirectoryPicker;
  if (!picker) {
    throw new Error('Tarayıcınız File System Access API (showDirectoryPicker) desteklemiyor. Dosyaları sürükle-bırak ile OPFS alanına alabilirsiniz.');
  }
  const dirHandle = await picker();
  const imported: { asset: AssetItem; bytes: Uint8Array }[] = [];

  for await (const [, handle] of (dirHandle as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    if (handle.kind === 'file') {
      const file = await (handle as FileSystemFileHandle).getFile();
      const res = await importFileIntoWorkspace(file, targetFolder);
      if (res) imported.push(res);
    }
  }

  return { assets: imported, folderName: dirHandle.name };
}
