import { computeAnchoredRect, isNodeActiveAtTime } from '../engine/sceneMath';
import type { AssetItem, ClipSequence, ProxyScale, SceneNode } from '../engine/types';

export interface LoadedMediaCache {
  images: Record<string, HTMLImageElement>;
  videos: Record<string, HTMLVideoElement>;
}

export function ensureImageLoaded(
  asset: AssetItem,
  cache: LoadedMediaCache,
  onReady?: () => void,
): HTMLImageElement | null {
  if (cache.images[asset.id]) {
    const img = cache.images[asset.id];
    return img.complete && img.naturalWidth > 0 ? img : null;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => onReady?.();
  img.src = asset.url;
  cache.images[asset.id] = img;
  return null;
}

export function ensureVideoLoaded(
  asset: AssetItem,
  cache: LoadedMediaCache,
  onReady?: () => void,
): HTMLVideoElement | null {
  if (cache.videos[asset.id]) {
    const vid = cache.videos[asset.id];
    return vid.readyState >= 2 ? vid : null;
  }
  const vid = document.createElement('video');
  vid.muted = true;
  vid.playsInline = true;
  vid.preload = 'auto';
  vid.onloadeddata = () => onReady?.();
  vid.src = asset.url;
  cache.videos[asset.id] = vid;
  return null;
}

function getAllClipNodesOrdered(clip: ClipSequence): SceneNode[] {
  const ordered: SceneNode[] = [];
  const visit = (id: string) => {
    const node = clip.nodes[id];
    if (!node) return;
    ordered.push(node);
    for (const childId of node.children) visit(childId);
  };
  for (const rootId of clip.rootNodeIds) visit(rootId);
  return ordered;
}

export function renderClipToCanvas(
  ctx: CanvasRenderingContext2D,
  stageWidth: number,
  stageHeight: number,
  proxyScale: ProxyScale,
  clip: ClipSequence,
  playheadMs: number,
  assets: Record<string, AssetItem>,
  cache: LoadedMediaCache,
  isPlaying: boolean,
  hiddenNodeIds: Record<string, boolean>,
  onAssetReady?: () => void,
): void {
  const renderW = Math.round(stageWidth * proxyScale);
  const renderH = Math.round(stageHeight * proxyScale);
  if (ctx.canvas.width !== renderW || ctx.canvas.height !== renderH) {
    ctx.canvas.width = renderW;
    ctx.canvas.height = renderH;
  }

  ctx.save();
  ctx.scale(proxyScale, proxyScale);
  ctx.fillStyle = '#090b10';
  ctx.fillRect(0, 0, stageWidth, stageHeight);

  const nodes = getAllClipNodesOrdered(clip);

  // Collect active MaterialEffect overlay passes (vignette, tint, grain)
  let vignette = 0.25;
  let tintColor = '#0f172a';
  let tintOpacity = 0;
  let filmGrain = 0.06;

  for (const node of nodes) {
    if (hiddenNodeIds[node.id] || !isNodeActiveAtTime(node, playheadMs)) continue;
    const mat = node.components.find((c) => c.type === 'MaterialEffect' && c.enabled);
    if (mat) {
      vignette = Number(mat.params.vignette ?? 0.25);
      tintColor = String(mat.params.tintColor ?? '#0f172a');
      tintOpacity = Number(mat.params.tintOpacity ?? 0);
      filmGrain = Number(mat.params.filmGrain ?? 0.06);
    }
  }

  // Draw Video / Image layers
  for (const node of nodes) {
    if (hiddenNodeIds[node.id] || !isNodeActiveAtTime(node, playheadMs)) continue;
    const vidComp = node.components.find((c) => c.type === 'VideoSource' && c.enabled);
    if (!vidComp) continue;

    const assetId = String(vidComp.params.assetId ?? '');
    const asset = assets[assetId];
    const rect = computeAnchoredRect(node.transform, stageWidth, stageHeight);
    const opacity = Number(vidComp.params.opacity ?? 1);
    const objectFit = String(vidComp.params.objectFit ?? 'cover');

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((rect.rotation * Math.PI) / 180);

    // Subtle slow cinematic camera push during playback
    const localProgress = Math.max(0, (playheadMs - node.startTime) / Math.max(1, node.duration));
    const kenBurnsScale = isPlaying ? 1 + localProgress * 0.025 : 1;
    ctx.scale(kenBurnsScale, kenBurnsScale);

    if (asset?.kind === 'video') {
      const videoEl = ensureVideoLoaded(asset, cache, onAssetReady);
      if (videoEl) {
        const trimInSec = Number(vidComp.params.trimInMs ?? 0) / 1000;
        const localSec = (playheadMs - node.startTime) / 1000;
        const targetTime = Math.max(0, trimInSec + localSec * Number(vidComp.params.playbackRate ?? 1));
        if (Math.abs(videoEl.currentTime - targetTime) > 0.18 && !videoEl.seeking) {
          videoEl.currentTime = targetTime % Math.max(0.1, videoEl.duration || 10);
        }
        drawFittedMedia(ctx, videoEl, videoEl.videoWidth || 1280, videoEl.videoHeight || 720, rect.width, rect.height, objectFit);
      } else {
        drawProceduralFallbackFrame(ctx, rect.width, rect.height, node.name, playheadMs);
      }
    } else if (asset?.kind === 'image') {
      const imgEl = ensureImageLoaded(asset, cache, onAssetReady);
      if (imgEl) {
        drawFittedMedia(ctx, imgEl, imgEl.naturalWidth, imgEl.naturalHeight, rect.width, rect.height, objectFit);
      } else {
        drawProceduralFallbackFrame(ctx, rect.width, rect.height, node.name, playheadMs);
      }
    } else {
      drawProceduralFallbackFrame(ctx, rect.width, rect.height, node.name, playheadMs);
    }

    ctx.restore();
  }

  // Color Tint pass
  if (tintOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = tintOpacity;
    ctx.fillStyle = tintColor;
    ctx.fillRect(0, 0, stageWidth, stageHeight);
    ctx.restore();
  }

  // Subtle animated atmospheric scan / rain shimmer when playing
  if (isPlaying && filmGrain > 0) {
    ctx.save();
    ctx.globalAlpha = filmGrain * 0.25;
    ctx.fillStyle = '#e2e8f0';
    const seed = Math.floor(playheadMs / 42);
    for (let i = 0; i < 28; i++) {
      const gx = ((seed * 7919 + i * 3571) % stageWidth);
      const gy = ((seed * 104729 + i * 6271) % stageHeight);
      ctx.fillRect(gx, gy, 1.5, 1.5);
    }
    ctx.restore();
  }

  // Vignette pass
  if (vignette > 0) {
    const grad = ctx.createRadialGradient(
      stageWidth / 2,
      stageHeight / 2,
      stageWidth * 0.24,
      stageWidth / 2,
      stageHeight / 2,
      stageWidth * 0.68,
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(4,6,10,${Math.min(0.95, vignette)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, stageWidth, stageHeight);
  }

  ctx.restore();
}

function drawFittedMedia(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  fit: string,
): void {
  if (fit === 'fill' || srcW === 0 || srcH === 0) {
    ctx.drawImage(source, -dstW / 2, -dstH / 2, dstW, dstH);
    return;
  }
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  let drawW = dstW;
  let drawH = dstH;

  if (fit === 'cover') {
    if (srcRatio > dstRatio) {
      drawH = dstH;
      drawW = dstH * srcRatio;
    } else {
      drawW = dstW;
      drawH = dstW / srcRatio;
    }
  } else {
    // contain
    if (srcRatio > dstRatio) {
      drawW = dstW;
      drawH = dstW / srcRatio;
    } else {
      drawH = dstH;
      drawW = dstH * srcRatio;
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(-dstW / 2, -dstH / 2, dstW, dstH);
  ctx.clip();
  ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function drawProceduralFallbackFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  label: string,
  playheadMs: number,
): void {
  const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  grad.addColorStop(0, '#131924');
  grad.addColorStop(1, '#0c1017');
  ctx.fillStyle = grad;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  ctx.strokeStyle = 'rgba(59, 130, 246, 0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);

  const pulse = 0.5 + 0.5 * Math.sin(playheadMs / 400);
  ctx.fillStyle = `rgba(148, 163, 184, ${0.4 + pulse * 0.2})`;
  ctx.font = '500 16px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 0, 6);
}

/**
 * Web Audio API procedural soundscape + sample trigger engine for Play Mode.
 */
export class StudioAudioEngine {
  private ctx: AudioContext | null = null;
  private activeOscs: { osc: OscillatorNode; gain: GainNode }[] = [];

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public startClipAmbience(mood: string, volume = 0.2): void {
    this.stopAll();
    const ctx = this.ensureContext();
    if (!ctx) return;

    const baseFreq =
      mood === 'control-hum' ? 92 : mood === 'dawn-pad' ? 146.83 : mood === 'station-chime' ? 196 : 65.41;

    try {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = mood === 'control-hum' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(mood === 'control-hum' ? 280 : 420, ctx.currentTime);

      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.005, Math.min(0.14, volume * 0.12)), ctx.currentTime + 0.45);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      this.activeOscs.push({ osc, gain });
    } catch {
      // Ignore autoplay restriction if user hasn't interacted yet
    }
  }

  public playInteractionChime(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.09);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.24);
    } catch {
      // Ignore audio errors
    }
  }

  public stopAll(): void {
    for (const item of this.activeOscs) {
      try {
        item.gain.gain.setTargetAtTime(0.0001, item.gain.context.currentTime, 0.05);
        item.osc.stop(item.osc.context.currentTime + 0.12);
      } catch {
        // Ignore already stopped
      }
    }
    this.activeOscs = [];
  }
}
