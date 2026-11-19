import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  readProjectFromIntBlob,
  verifyIntBlob,
} from '../../engine/intFormat';
import { executeSafeAction, type SafeRuntimeState } from '../../engine/iscRegistry';
import { computeAnchoredRect, formatBytes, formatTimecode, isNodeActiveAtTime } from '../../engine/sceneMath';
import type { IntVerificationResult, ProjectData } from '../../engine/types';
import { renderClipToCanvas, StudioAudioEngine, type LoadedMediaCache } from '../../services/mediaEngine';
import { useStudioStore } from '../../store/useStudioStore';

export const IntPlayerView: React.FC = () => {
  const lastBuiltInt = useStudioStore((s) => s.lastBuiltInt);

  const [activeBlob, setActiveBlob] = useState<Blob | null>(null);
  const [fileLabel, setFileLabel] = useState<string>('');
  const [verification, setVerification] = useState<IntVerificationResult | null>(null);
  const [loadedProject, setLoadedProject] = useState<ProjectData | null>(null);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [runtime, setRuntime] = useState<SafeRuntimeState | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaCacheRef = useRef<LoadedMediaCache>({ images: {}, videos: {} });
  const audioRef = useRef<StudioAudioEngine | null>(null);
  const [renderTick, setRenderTick] = useState(0);

  const inspectAndLoadBlob = async (blob: Blob, label: string) => {
    setActiveBlob(blob);
    setFileLabel(label);
    setIsPlaying(false);

    const res = await verifyIntBlob(blob);
    setVerification(res);

    if (res.valid) {
      const parsed = await readProjectFromIntBlob(blob, res.entries);
      for (const [id, url] of Object.entries(parsed.assetUrls)) {
        if (parsed.project.assets[id]) {
          parsed.project.assets[id].url = url;
        }
      }
      setAssetUrls(parsed.assetUrls);
      setLoadedProject(parsed.project);
      setRuntime({
        activeClipId: parsed.project.metadata.entryClipId,
        playheadMs: 0,
        variables: { ...parsed.project.initialVariables },
        hiddenNodeIds: {},
        triggeredAudioNodeIds: [],
      });
      setIsPlaying(true);
    } else {
      setLoadedProject(null);
      setRuntime(null);
    }
  };

  useEffect(() => {
    if (lastBuiltInt && lastBuiltInt.blob !== activeBlob) {
      void inspectAndLoadBlob(
        lastBuiltInt.blob,
        `${lastBuiltInt.manifest.title}.int (Build #${lastBuiltInt.manifest.buildNumber})`,
      );
    }
  }, [lastBuiltInt]);

  useEffect(() => {
    if (!isPlaying || !loadedProject || !runtime) return;
    let rafId = 0;
    let lastTs = performance.now();
    let accum = 0;
    const tick = (now: number) => {
      const dt = Math.min(100, now - lastTs);
      lastTs = now;
      accum += dt;
      if (accum >= 42) {
        const step = accum;
        accum = 0;
        setRuntime((prev) => {
          if (!prev) return prev;
          const clip = loadedProject.clips[prev.activeClipId];
          if (!clip) return prev;
          let nextMs = prev.playheadMs + step;
          if (nextMs >= clip.durationMs) nextMs = 0;
          return { ...prev, playheadMs: Math.round(nextMs) };
        });
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, loadedProject, runtime?.activeClipId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loadedProject || !runtime) return;
    const clip = loadedProject.clips[runtime.activeClipId];
    if (!clip) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderClipToCanvas(
      ctx,
      1280,
      720,
      1,
      clip,
      runtime.playheadMs,
      loadedProject.assets,
      mediaCacheRef.current,
      isPlaying,
      runtime.hiddenNodeIds,
      () => setRenderTick((t) => t + 1),
    );
  }, [loadedProject, runtime, isPlaying, renderTick, assetUrls]);

  const simulateTamperAttack = async () => {
    if (!activeBlob || !verification?.entries.length) return;
    const buf = await activeBlob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const targetEntry = verification.entries.find((e) => e.fileName === 'scenes.json') ?? verification.entries[0];
    if (targetEntry && targetEntry.dataOffset < bytes.length) {
      bytes[targetEntry.dataOffset] = bytes[targetEntry.dataOffset] ^ 0x55;
    }
    const tampered = new Blob([bytes]);
    await inspectAndLoadBlob(tampered, `${fileLabel} [TAMPERED]`);
  };

  const activeClip = loadedProject && runtime ? loadedProject.clips[runtime.activeClipId] : null;

  return (
    <div className="h-full bg-[#080a0f] text-slate-200 flex flex-col overflow-y-auto p-2">
      <div className="min-h-full bg-[#121622] border border-indigo-400/20 rounded-[10px] p-5 space-y-5">
        <div className="bg-[#0e121d] border border-white/[0.08] rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-base font-semibold text-white">
              KinoForge .int Player &amp; Integrity Verifier
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Central Directory byte-offset streaming, SHA-256 verification, and ECDSA P-256 signature validation.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-teal-500 hover:bg-teal-400 text-xs font-semibold text-slate-950 cursor-pointer whitespace-nowrap">
              <Upload className="w-3.5 h-3.5" />
              Open .int File
              <input
                type="file"
                accept=".int,.zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void inspectAndLoadBlob(f, f.name);
                }}
              />
            </label>

            {lastBuiltInt && (
              <button
                type="button"
                onClick={() =>
                  void inspectAndLoadBlob(
                    lastBuiltInt.blob,
                    `${lastBuiltInt.manifest.title}.int (Build #${lastBuiltInt.manifest.buildNumber})`,
                  )
                }
                className="px-3 py-2 rounded-md bg-[#1a2030] hover:bg-[#232c42] border border-white/[0.1] text-xs font-medium text-slate-100 cursor-pointer whitespace-nowrap"
              >
                Load Latest Build
              </button>
            )}
          </div>
        </div>

        {verification && (
          <div
            data-testid="int-verification-banner"
            data-valid={String(verification.valid)}
            className={`rounded-lg border p-4 space-y-3 ${
              verification.valid
                ? 'bg-[#0e1b18] border-teal-500/45'
                : 'bg-[#1c1014] border-rose-500/55'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {verification.valid ? (
                  <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
                )}
                <div>
                  <div className="text-sm font-semibold text-white">
                    {verification.valid
                      ? 'Signature & Integrity Verified — Trusted Package'
                      : 'Security Alert: Package Tampered or Signature Invalid'}
                  </div>
                  <div className="text-xs text-slate-300 font-mono">
                    {fileLabel} · {verification.entries.length} STORE archive entries
                  </div>
                </div>
              </div>

              {verification.valid && (
                <button
                  type="button"
                  onClick={() => void simulateTamperAttack()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 text-xs font-medium text-purple-200 cursor-pointer whitespace-nowrap"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Tamper Test (Flip 1 Byte)
                </button>
              )}
            </div>

            {verification.reason && (
              <p className="text-xs text-rose-300 font-medium">{verification.reason}</p>
            )}

            {verification.signatureBlock && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-white/10 text-xs font-mono tabular-nums">
                <div>
                  <span className="block text-[11px] text-slate-400">Producer / Studio</span>
                  <span className="text-slate-100">{verification.signatureBlock.producer.studioName}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-slate-400">Producer ID</span>
                  <span className="text-slate-100">{verification.signatureBlock.producer.userId}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-slate-400">Key Fingerprint</span>
                  <span className="text-slate-100">{verification.signatureBlock.producer.publicKeyFingerprint}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-slate-400">Timestamp (UTC)</span>
                  <span className="text-slate-100">{verification.signatureBlock.timestampUtc}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {verification?.valid && loadedProject && runtime && activeClip ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2 bg-[#0e121d] border border-white/[0.08] rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-100">{activeClip.name}</span>
                <div className="flex items-center gap-2.5 font-mono tabular-nums text-slate-300">
                  <span className="text-cyan-300">{formatTimecode(runtime.playheadMs, activeClip.fps)}</span>
                  <button
                    type="button"
                    onClick={() => setIsPlaying((p) => !p)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-teal-500 text-slate-950 font-semibold text-xs cursor-pointer"
                  >
                    <Play className="w-3 h-3" />
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setRuntime({
                        activeClipId: loadedProject.metadata.entryClipId,
                        playheadMs: 0,
                        variables: { ...loadedProject.initialVariables },
                        hiddenNodeIds: {},
                        triggeredAudioNodeIds: [],
                      })
                    }
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#1a2030] text-slate-200 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restart
                  </button>
                </div>
              </div>

              <div className="relative w-full aspect-video bg-black overflow-hidden">
                <canvas ref={canvasRef} className="w-full h-full block" />
                <div className="absolute inset-0">
                  {Object.values(activeClip.nodes)
                    .filter((n) => isNodeActiveAtTime(n, runtime.playheadMs) && !runtime.hiddenNodeIds[n.id])
                    .map((node) => {
                      const btnComp = node.components.find((c) => c.type === 'InteractiveButton' && c.enabled);
                      const txtComp = node.components.find((c) => c.type === 'TextRenderer' && c.enabled);
                      const rect = computeAnchoredRect(node.transform, 1280, 720);
                      const leftPct = `${(rect.x / 1280) * 100}%`;
                      const topPct = `${(rect.y / 720) * 100}%`;
                      const wPct = `${(rect.width / 1280) * 100}%`;
                      const hPct = `${(rect.height / 720) * 100}%`;

                      if (btnComp) {
                        return (
                          <button
                            key={node.id}
                            type="button"
                            onClick={() => {
                              if (!audioRef.current) audioRef.current = new StudioAudioEngine();
                              audioRef.current.playInteractionChime();
                              setRuntime((prev) => {
                                if (!prev) return prev;
                                let next = prev;
                                for (const c of node.components) {
                                  if (c.type === 'EventTrigger' && c.enabled && c.params.triggerType === 'OnClick') {
                                    next = executeSafeAction(c.params, loadedProject, next);
                                  }
                                }
                                return next;
                              });
                            }}
                            className="absolute flex flex-col items-center justify-center px-3 text-center hover:scale-[1.03] transition-transform cursor-pointer"
                            style={{
                              left: leftPct,
                              top: topPct,
                              width: wPct,
                              height: hPct,
                              backgroundColor: String(btnComp.params.bgColor ?? '#161d29'),
                              color: String(btnComp.params.textColor ?? '#fff'),
                              border: `1.5px solid ${String(btnComp.params.borderColor ?? '#3b82f6')}`,
                              borderRadius: `${Number(btnComp.params.borderRadius ?? 8)}px`,
                            }}
                          >
                            <span className="text-xs sm:text-sm font-semibold leading-tight">
                              {String(btnComp.params.label ?? node.name)}
                            </span>
                            {Boolean(btnComp.params.subtitle) && (
                              <span className="text-[10px] opacity-75">{String(btnComp.params.subtitle)}</span>
                            )}
                          </button>
                        );
                      }

                      if (txtComp) {
                        return (
                          <div
                            key={node.id}
                            className="absolute flex items-center px-3 py-2 rounded"
                            style={{
                              left: leftPct,
                              top: topPct,
                              width: wPct,
                              height: hPct,
                              color: String(txtComp.params.color ?? '#f1f5f9'),
                              backgroundColor: txtComp.params.backgroundScrim ? 'rgba(9,12,18,0.72)' : 'transparent',
                            }}
                          >
                            <span className="text-xs sm:text-base font-semibold leading-snug">
                              {String(txtComp.params.text ?? '')}
                            </span>
                          </div>
                        );
                      }

                      return null;
                    })}
                </div>
              </div>
            </div>

            <div className="bg-[#0e121d] border border-white/[0.08] rounded-lg p-4 space-y-3">
              <h2 className="text-xs font-semibold text-slate-200">
                Central Directory (Byte-Offset Table)
              </h2>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {verification.entries.map((entry) => (
                  <div
                    key={entry.fileName}
                    className="p-2 rounded bg-[#090b10] border border-white/[0.06] text-[11px] font-mono tabular-nums space-y-0.5"
                  >
                    <div className="text-slate-100 truncate">{entry.fileName}</div>
                    <div className="text-slate-400">
                      Offset: {entry.dataOffset} · {formatBytes(entry.uncompressedSize)} · STORE ({entry.compressionMethod})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : !verification ? (
          <div className="bg-[#0e121d] border border-dashed border-white/[0.12] rounded-lg p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-200">No .int Package Loaded Yet</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Use the Build .int icon in the left rail to sign and compile the active project, or open an existing .int file from disk.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
};
