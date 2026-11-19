import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileCode2, PackageCheck, ShieldCheck, X } from 'lucide-react';
import {
  buildIntContainer,
  generateStandaloneHtmlPlayer,
  type AssetBinaryPayload,
} from '../../engine/intFormat';
import { collectUsedAssetIds, formatBytes } from '../../engine/sceneMath';
import { useStudioStore } from '../../store/useStudioStore';

export const BuildIntModal: React.FC = () => {
  const buildModalOpen = useStudioStore((s) => s.buildModalOpen);
  const setBuildModalOpen = useStudioStore((s) => s.setBuildModalOpen);
  const project = useStudioStore((s) => s.project);
  const assetPayloads = useStudioStore((s) => s.assetPayloads);
  const setLastBuiltInt = useStudioStore((s) => s.setLastBuiltInt);
  const lastBuiltInt = useStudioStore((s) => s.lastBuiltInt);
  const setWorkspaceView = useStudioStore((s) => s.setWorkspaceView);
  const updateProjectMetadata = useStudioStore((s) => s.updateProjectMetadata);

  const [producerName, setProducerName] = useState(project.metadata.authorName);
  const [producerId, setProducerId] = useState(project.metadata.authorId);
  const [buildNumber, setBuildNumber] = useState(project.metadata.buildNumber);
  const [building, setBuilding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const treeShakeInfo = useMemo(() => collectUsedAssetIds(project), [project]);
  const savedBytes = treeShakeInfo.unusedIds.reduce(
    (sum, id) => sum + (project.assets[id]?.sizeBytes ?? 0),
    0,
  );

  if (!buildModalOpen) return null;

  const handleCompile = async () => {
    if (!producerName.trim() || !producerId.trim()) {
      setErrorMsg('Producer / Studio name and User ID are required.');
      return;
    }
    setErrorMsg(null);
    setBuilding(true);

    try {
      const payloads: Record<string, AssetBinaryPayload> = {};
      for (const assetId of treeShakeInfo.usedIds) {
        const asset = project.assets[assetId];
        if (!asset) continue;
        if (assetPayloads[assetId]) {
          payloads[assetId] = {
            assetId,
            fileName: asset.name,
            bytes: assetPayloads[assetId],
          };
        } else if (asset.url && !asset.url.startsWith('blob:')) {
          try {
            const resp = await fetch(asset.url);
            if (resp.ok) {
              const buf = await resp.arrayBuffer();
              payloads[assetId] = {
                assetId,
                fileName: asset.name,
                bytes: new Uint8Array(buf),
              };
            }
          } catch {
            // Fall back to synthetic ref inside buildIntContainer
          }
        }
      }

      const result = await buildIntContainer(project, {
        producerName: producerName.trim(),
        producerId: producerId.trim(),
        buildNumber,
        assetPayloads: payloads,
      });

      updateProjectMetadata({
        authorName: producerName.trim(),
        authorId: producerId.trim(),
        buildNumber: buildNumber + 1,
      });
      setBuildNumber((b) => b + 1);
      setLastBuiltInt(result);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to build .int package.');
    } finally {
      setBuilding(false);
    }
  };

  const triggerDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="build-int-title"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="w-full max-w-2xl bg-[#121622] border border-indigo-400/25 rounded-[10px] shadow-2xl overflow-hidden text-slate-200">
        <div className="px-5 py-3.5 border-b border-white/[0.06] bg-[#131826] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-teal-400" />
            <h2 id="build-int-title" className="font-display text-sm font-semibold text-white">
              Build &amp; Cryptographically Sign .int Package
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setBuildModalOpen(false)}
            className="p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="bg-[#0b0e17] border border-white/[0.07] rounded-md p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">Tree-Shaking &amp; STORE Mode Analysis</span>
              <span className="font-mono tabular-nums text-teal-300">
                {treeShakeInfo.unusedIds.length} unused asset(s) pruned ({formatBytes(savedBytes)} saved)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-1 text-xs font-mono tabular-nums">
              <div>
                <span className="block text-[11px] text-slate-500">Packaged Media</span>
                <span className="text-slate-100">{treeShakeInfo.usedIds.length} assets (Level 0 STORE)</span>
              </div>
              <div>
                <span className="block text-[11px] text-slate-500">Branching Clips</span>
                <span className="text-slate-100">{project.clipOrder.length} Clips</span>
              </div>
              <div>
                <span className="block text-[11px] text-slate-500">Signing Algorithm</span>
                <span className="text-slate-100">ECDSA P-256 + SHA-256</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="int-producer-name" className="block text-xs text-slate-400 mb-1">
                Producer / Studio Name
              </label>
              <input
                id="int-producer-name"
                type="text"
                value={producerName}
                onChange={(e) => setProducerName(e.target.value)}
                className="w-full h-8 px-2.5 text-xs bg-[#0b0e17] border border-white/[0.08] rounded text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="int-producer-id" className="block text-xs text-slate-400 mb-1">
                Producer ID
              </label>
              <input
                id="int-producer-id"
                type="text"
                value={producerId}
                onChange={(e) => setProducerId(e.target.value)}
                className="w-full h-8 px-2.5 text-xs font-mono bg-[#0b0e17] border border-white/[0.08] rounded text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="int-build-num" className="block text-xs text-slate-400 mb-1">
                Build Number
              </label>
              <input
                id="int-build-num"
                type="number"
                min={1}
                value={buildNumber}
                onChange={(e) => setBuildNumber(Math.max(1, Number(e.target.value)))}
                className="w-full h-8 px-2.5 text-xs font-mono tabular-nums bg-[#0b0e17] border border-white/[0.08] rounded text-slate-100"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded bg-rose-950/50 border border-rose-500/50 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={building}
              onClick={() => void handleCompile()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-xs font-semibold text-slate-950 cursor-pointer whitespace-nowrap"
            >
              <ShieldCheck className="w-4 h-4" />
              {building ? 'Building & Signing...' : 'Build & Sign .int Package'}
            </button>
          </div>

          {lastBuiltInt && (
            <div className="bg-[#0e1b18] border border-teal-500/40 rounded-md p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-teal-300 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>.int Package Sealed &amp; Signed</span>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-300">
                  {formatBytes(lastBuiltInt.bytes.byteLength)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300">
                <div>
                  <span className="text-slate-500">Fingerprint: </span>
                  {lastBuiltInt.signatureBlock.producer.publicKeyFingerprint}
                </div>
                <div>
                  <span className="text-slate-500">UTC Time: </span>
                  {lastBuiltInt.signatureBlock.timestampUtc}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    triggerDownload(
                      lastBuiltInt.blob,
                      `${project.metadata.title.toLowerCase().replace(/[^a-z0-9]+/gi, '_')}.int`,
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#1a2030] hover:bg-[#232c42] border border-white/[0.1] text-xs font-medium text-white cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  Download .int
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const html = generateStandaloneHtmlPlayer(lastBuiltInt.manifest);
                    triggerDownload(
                      new Blob([html], { type: 'text/html' }),
                      `${project.metadata.title.toLowerCase().replace(/[^a-z0-9]+/gi, '_')}_player.html`,
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#1a2030] hover:bg-[#232c42] border border-white/[0.1] text-xs font-medium text-white cursor-pointer whitespace-nowrap"
                >
                  <FileCode2 className="w-3.5 h-3.5 text-purple-400" />
                  Standalone HTML Player
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBuildModalOpen(false);
                    setWorkspaceView('player');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-500 hover:bg-teal-400 text-xs font-semibold text-slate-950 cursor-pointer whitespace-nowrap"
                >
                  Open &amp; Verify in Player
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
