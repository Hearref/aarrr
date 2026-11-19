import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  Magnet,
  Maximize2,
  Minimize2,
  Play,
  Redo2,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import {
  canvasPosToAnchorOffset,
  computeAnchoredRect,
  computeSnapGuides,
  formatTimecode,
  isNodeActiveAtTime,
  type SnapGuide,
} from '../../engine/sceneMath';
import type { ProxyScale, SceneNode } from '../../engine/types';
import { renderClipToCanvas, StudioAudioEngine, type LoadedMediaCache } from '../../services/mediaEngine';
import { useStudioStore } from '../../store/useStudioStore';

const STAGE_W = 1280;
const STAGE_H = 720;

type DragKind =
  | 'move'
  | 'rotate'
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w';

interface DragSession {
  kind: DragKind;
  nodeId: string;
  startClientX: number;
  startClientY: number;
  origRect: { x: number; y: number; width: number; height: number; rotation: number };
  beforeProject: ReturnType<typeof useStudioStore.getState>['project'];
}

export const SceneViewportPanel: React.FC = () => {
  const project = useStudioStore((s) => s.project);
  const activeClipId = useStudioStore((s) => s.activeClipId);
  const selectedNodeId = useStudioStore((s) => s.selectedNodeId);
  const playheadMs = useStudioStore((s) => s.playheadMs);
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const editorMode = useStudioStore((s) => s.editorMode);
  const proxyScale = useStudioStore((s) => s.proxyScale);
  const snapEnabled = useStudioStore((s) => s.snapEnabled);
  const runtimeVariables = useStudioStore((s) => s.runtimeVariables);
  const hiddenNodeIds = useStudioStore((s) => s.hiddenNodeIds);
  const undoCount = useStudioStore((s) => s.undoStack.length);
  const redoCount = useStudioStore((s) => s.redoStack.length);

  const setEditorMode = useStudioStore((s) => s.setEditorMode);
  const setProxyScale = useStudioStore((s) => s.setProxyScale);
  const setSnapEnabled = useStudioStore((s) => s.setSnapEnabled);
  const setIsPlaying = useStudioStore((s) => s.setIsPlaying);
  const selectNode = useStudioStore((s) => s.selectNode);
  const stepPlayhead = useStudioStore((s) => s.stepPlayhead);
  const updateNodeTransform = useStudioStore((s) => s.updateNodeTransform);
  const commitHistorySnapshot = useStudioStore((s) => s.commitHistorySnapshot);
  const triggerNodeEvent = useStudioStore((s) => s.triggerNodeEvent);
  const resetRuntimeState = useStudioStore((s) => s.resetRuntimeState);
  const createSceneNode = useStudioStore((s) => s.createSceneNode);
  const undo = useStudioStore((s) => s.undo);
  const redo = useStudioStore((s) => s.redo);

  const panelRootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaCacheRef = useRef<LoadedMediaCache>({ images: {}, videos: {} });
  const audioRef = useRef<StudioAudioEngine | null>(null);
  const firedTimeTriggersRef = useRef<Set<string>>(new Set());

  const [stageDisplayScale, setStageDisplayScale] = useState(0.5);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const activeClip = project.clips[activeClipId];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateScale = () => {
      const pad = 16;
      const availW = Math.max(240, el.clientWidth - pad);
      const availH = Math.max(140, el.clientHeight - pad);
      setStageDisplayScale(Math.min(availW / STAGE_W, availH / STAGE_H, 1.2));
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    const el = panelRootRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setIsFullscreen((v) => !v);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    if (!audioRef.current) audioRef.current = new StudioAudioEngine();
    const audio = audioRef.current;

    if (isPlaying && editorMode === 'play' && activeClip) {
      const audioNode = Object.values(activeClip.nodes).find((n) =>
        n.components.some((c) => c.type === 'AudioEmitter' && c.enabled),
      );
      const emitter = audioNode?.components.find((c) => c.type === 'AudioEmitter' && c.enabled);
      const mood = String(emitter?.params.synthMood ?? 'noir-drone');
      const vol = Number(emitter?.params.volume ?? 0.65);
      audio.startClipAmbience(mood, vol);
    } else {
      audio.stopAll();
    }
    return () => {
      audio.stopAll();
    };
  }, [isPlaying, editorMode, activeClipId]);

  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let lastTs = performance.now();
    let accum = 0;
    const tick = (now: number) => {
      const dt = Math.min(100, now - lastTs);
      lastTs = now;
      accum += dt;
      if (accum >= 42) {
        stepPlayhead(accum);
        accum = 0;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, stepPlayhead]);

  useEffect(() => {
    firedTimeTriggersRef.current.clear();
  }, [activeClipId]);

  useEffect(() => {
    if (editorMode !== 'play' || !isPlaying || !activeClip) return;
    for (const node of Object.values(activeClip.nodes)) {
      if (!isNodeActiveAtTime(node, playheadMs)) continue;
      for (const comp of node.components) {
        if (comp.type === 'EventTrigger' && comp.enabled && comp.params.triggerType === 'OnTimeReach') {
          const tMs = Number(comp.params.triggerTimeMs ?? 0);
          const key = `${activeClipId}:${node.id}:${comp.id}`;
          if (playheadMs >= tMs && !firedTimeTriggersRef.current.has(key)) {
            firedTimeTriggersRef.current.add(key);
            triggerNodeEvent(activeClipId, node.id, 'OnTimeReach');
          }
        }
      }
    }
  }, [editorMode, isPlaying, playheadMs, activeClip, activeClipId, triggerNodeEvent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeClip) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderClipToCanvas(
      ctx,
      STAGE_W,
      STAGE_H,
      proxyScale,
      activeClip,
      playheadMs,
      project.assets,
      mediaCacheRef.current,
      isPlaying,
      editorMode === 'play' ? hiddenNodeIds : {},
      () => setRenderTick((t) => t + 1),
    );
  }, [activeClip, playheadMs, proxyScale, project.assets, isPlaying, editorMode, hiddenNodeIds, renderTick]);

  const orderedActiveNodes = useMemo(() => {
    if (!activeClip) return [];
    const list: SceneNode[] = [];
    const visit = (id: string) => {
      const n = activeClip.nodes[id];
      if (!n) return;
      list.push(n);
      for (const cid of n.children) visit(cid);
    };
    for (const rid of activeClip.rootNodeIds) visit(rid);
    return list.filter(
      (n) =>
        isNodeActiveAtTime(n, playheadMs) &&
        !(editorMode === 'play' && hiddenNodeIds[n.id]),
    );
  }, [activeClip, playheadMs, editorMode, hiddenNodeIds]);

  const startDrag = useCallback(
    (e: React.PointerEvent, kind: DragKind, node: SceneNode) => {
      if (editorMode !== 'edit' || node.locked) return;
      e.stopPropagation();
      e.preventDefault();
      selectNode(node.id);
      const rect = computeAnchoredRect(node.transform, STAGE_W, STAGE_H);
      setDragSession({
        kind,
        nodeId: node.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origRect: rect,
        beforeProject: JSON.parse(JSON.stringify(project)),
      });
    },
    [editorMode, project, selectNode],
  );

  useEffect(() => {
    if (!dragSession || !activeClip) return;

    const onPointerMove = (e: PointerEvent) => {
      const node = activeClip.nodes[dragSession.nodeId];
      if (!node) return;
      const dx = (e.clientX - dragSession.startClientX) / stageDisplayScale;
      const dy = (e.clientY - dragSession.startClientY) / stageDisplayScale;
      const orig = dragSession.origRect;

      if (dragSession.kind === 'move') {
        let nextX = orig.x + dx;
        let nextY = orig.y + dy;

        if (snapEnabled) {
          const otherRects = orderedActiveNodes
            .filter((n) => n.id !== node.id && n.trackKind !== 'video' && n.trackKind !== 'effect')
            .map((n) => computeAnchoredRect(n.transform, STAGE_W, STAGE_H));
          const snapped = computeSnapGuides(
            { x: nextX, y: nextY, width: orig.width, height: orig.height },
            otherRects,
            STAGE_W,
            STAGE_H,
            10,
          );
          nextX = snapped.x;
          nextY = snapped.y;
          setSnapGuides(snapped.guides);
        } else {
          setSnapGuides([]);
        }

        const offset = canvasPosToAnchorOffset(
          nextX,
          nextY,
          orig.width,
          orig.height,
          node.transform.anchor,
          STAGE_W,
          STAGE_H,
        );
        updateNodeTransform(activeClipId, node.id, { x: offset.x, y: offset.y }, false);
      } else if (dragSession.kind === 'rotate') {
        const stageEl = stageRef.current;
        if (!stageEl) return;
        const bounds = stageEl.getBoundingClientRect();
        const cx = bounds.left + (orig.x + orig.width / 2) * stageDisplayScale;
        const cy = bounds.top + (orig.y + orig.height / 2) * stageDisplayScale;
        const angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
        updateNodeTransform(activeClipId, node.id, { rotation: Math.round(angle) }, false);
      } else {
        let x = orig.x;
        let y = orig.y;
        let w = orig.width;
        let h = orig.height;

        if (dragSession.kind.includes('e')) w = Math.max(40, orig.width + dx);
        if (dragSession.kind.includes('s')) h = Math.max(32, orig.height + dy);
        if (dragSession.kind.includes('w')) {
          const nw = Math.max(40, orig.width - dx);
          x = orig.x + (orig.width - nw);
          w = nw;
        }
        if (dragSession.kind.includes('n')) {
          const nh = Math.max(32, orig.height - dy);
          y = orig.y + (orig.height - nh);
          h = nh;
        }

        const offset = canvasPosToAnchorOffset(
          x,
          y,
          w,
          h,
          node.transform.anchor,
          STAGE_W,
          STAGE_H,
        );
        updateNodeTransform(
          activeClipId,
          node.id,
          { x: offset.x, y: offset.y, width: Math.round(w), height: Math.round(h) },
          false,
        );
      }
    };

    const onPointerUp = () => {
      commitHistorySnapshot('Gizmo Transform', dragSession.beforeProject);
      setDragSession(null);
      setSnapGuides([]);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [dragSession, activeClip, activeClipId, orderedActiveNodes, snapEnabled, stageDisplayScale, updateNodeTransform, commitHistorySnapshot]);

  const selectedNode = selectedNodeId && activeClip ? activeClip.nodes[selectedNodeId] : null;
  const selectedRect =
    selectedNode && isNodeActiveAtTime(selectedNode, playheadMs) && editorMode === 'edit'
      ? computeAnchoredRect(selectedNode.transform, STAGE_W, STAGE_H)
      : null;

  return (
    <div
      ref={panelRootRef}
      className="h-full flex flex-col bg-[#0b0d14] text-slate-200 select-none relative overflow-hidden"
    >
      {/* Play Mode Runtime Variable Strip */}
      {editorMode === 'play' && (
        <div className="px-3 py-1 bg-[#121622] border-b border-white/[0.06] flex items-center justify-between gap-4 text-xs z-20">
          <div className="flex items-center gap-3 overflow-x-auto font-mono tabular-nums">
            <span className="text-purple-300 font-semibold whitespace-nowrap">LIVE EDIT</span>
            <span className="text-slate-400 whitespace-nowrap">{activeClip?.name}</span>
            {Object.entries(runtimeVariables).map(([k, v]) => (
              <span key={k} className="text-slate-300 whitespace-nowrap">
                {k}={String(v)}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={resetRuntimeState}
            className="inline-flex items-center gap-1 text-slate-400 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>
      )}

      {/* Full Stage Area */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 flex items-center justify-center relative overflow-hidden bg-[#06080d]"
        onClick={() => {
          if (editorMode === 'edit') selectNode(null);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const assetId = e.dataTransfer.getData('application/x-kinoforge-asset');
          if (assetId && project.assets[assetId]) {
            const asset = project.assets[assetId];
            createSceneNode(asset.kind === 'audio' ? 'audio' : 'video', assetId);
          }
        }}
      >
        <div
          ref={stageRef}
          data-testid="scene-stage"
          data-mode={editorMode}
          data-clip={activeClipId}
          className="relative shadow-[0_24px_64px_rgba(0,0,0,0.75)] bg-black overflow-hidden shrink-0 rounded-[4px]"
          style={{
            width: `${Math.round(STAGE_W * stageDisplayScale)}px`,
            height: `${Math.round(STAGE_H * stageDisplayScale)}px`,
          }}
        >
          {/* GPU/Canvas2D Media & Shader Layer */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{
              filter: (() => {
                const matNode = orderedActiveNodes.find((n) =>
                  n.components.some((c) => c.type === 'MaterialEffect' && c.enabled),
                );
                const mat = matNode?.components.find((c) => c.type === 'MaterialEffect' && c.enabled);
                if (!mat) return undefined;
                const b = Number(mat.params.brightness ?? 1);
                const c = Number(mat.params.contrast ?? 1);
                const s = Number(mat.params.saturation ?? 1);
                const bl = Number(mat.params.blur ?? 0);
                return `brightness(${b}) contrast(${c}) saturate(${s})${bl > 0 ? ` blur(${bl}px)` : ''}`;
              })(),
            }}
          />

          {/* Synchronized Crisp DOM Overlay */}
          <div className="absolute inset-0">
            {orderedActiveNodes.map((node) => {
              const btnComp = node.components.find((c) => c.type === 'InteractiveButton' && c.enabled);
              const txtComp = node.components.find((c) => c.type === 'TextRenderer' && c.enabled);
              if (!btnComp && !txtComp) return null;

              const rect = computeAnchoredRect(node.transform, STAGE_W, STAGE_H);
              const left = rect.x * stageDisplayScale;
              const top = rect.y * stageDisplayScale;
              const width = rect.width * stageDisplayScale;
              const height = rect.height * stageDisplayScale;

              if (btnComp) {
                const bg = String(btnComp.params.bgColor ?? '#161d29');
                const fg = String(btnComp.params.textColor ?? '#f8fafc');
                const border = String(btnComp.params.borderColor ?? '#3b82f6');
                const radius = Number(btnComp.params.borderRadius ?? 8) * stageDisplayScale;
                const fSize = Math.max(11, Number(btnComp.params.fontSize ?? 15) * stageDisplayScale);
                const subSize = Math.max(9, fSize * 0.74);

                return (
                  <button
                    key={node.id}
                    type="button"
                    onPointerDown={(e) => {
                      if (editorMode === 'edit') startDrag(e, 'move', node);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (editorMode === 'play') {
                        audioRef.current?.playInteractionChime();
                        triggerNodeEvent(activeClipId, node.id, 'OnClick');
                      } else {
                        selectNode(node.id);
                      }
                    }}
                    onMouseEnter={() => {
                      if (editorMode === 'play') triggerNodeEvent(activeClipId, node.id, 'OnHover');
                    }}
                    className={`absolute flex flex-col items-center justify-center px-3 text-center transition-transform cursor-pointer ${
                      editorMode === 'play' ? 'hover:scale-[1.03]' : ''
                    }`}
                    style={{
                      left,
                      top,
                      width,
                      height,
                      transform: `rotate(${rect.rotation}deg)`,
                      backgroundColor: bg,
                      color: fg,
                      border: `1.5px solid ${border}`,
                      borderRadius: `${radius}px`,
                    }}
                  >
                    <span className="font-display font-semibold leading-tight truncate max-w-full" style={{ fontSize: `${fSize}px` }}>
                      {String(btnComp.params.label ?? node.name)}
                    </span>
                    {Boolean(btnComp.params.subtitle) && (
                      <span className="opacity-75 truncate max-w-full mt-0.5" style={{ fontSize: `${subSize}px` }}>
                        {String(btnComp.params.subtitle)}
                      </span>
                    )}
                  </button>
                );
              }

              if (txtComp) {
                const fSize = Math.max(11, Number(txtComp.params.fontSize ?? 22) * stageDisplayScale);
                const color = String(txtComp.params.color ?? '#f1f5f9');
                const align = String(txtComp.params.align ?? 'left') as 'left' | 'center' | 'right';
                const scrim = Boolean(txtComp.params.backgroundScrim);
                const weight = String(txtComp.params.fontWeight ?? '600');

                return (
                  <div
                    key={node.id}
                    role={editorMode === 'edit' ? 'button' : undefined}
                    tabIndex={editorMode === 'edit' ? 0 : undefined}
                    aria-label={editorMode === 'edit' ? `Select ${node.name}` : undefined}
                    onPointerDown={(e) => {
                      if (editorMode === 'edit') startDrag(e, 'move', node);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (editorMode === 'edit') selectNode(node.id);
                    }}
                    className="absolute flex items-center px-3 py-2 rounded"
                    style={{
                      left,
                      top,
                      width,
                      height,
                      transform: `rotate(${rect.rotation}deg)`,
                      color,
                      textAlign: align,
                      fontSize: `${fSize}px`,
                      fontWeight: weight,
                      backgroundColor: scrim ? 'rgba(9, 12, 18, 0.72)' : 'transparent',
                      backdropFilter: scrim ? 'blur(4px)' : undefined,
                      cursor: editorMode === 'edit' ? 'move' : 'default',
                    }}
                  >
                    <span className="w-full leading-snug">{String(txtComp.params.text ?? '')}</span>
                  </div>
                );
              }

              return null;
            })}
          </div>

          {/* Snapping Guides (Edit Mode) */}
          {editorMode === 'edit' &&
            snapGuides.map((g, idx) =>
              g.axis === 'x' ? (
                <div
                  key={`gx-${idx}`}
                  className="absolute top-0 bottom-0 w-px bg-cyan-400 pointer-events-none z-20"
                  style={{ left: `${g.position * stageDisplayScale}px` }}
                />
              ) : (
                <div
                  key={`gy-${idx}`}
                  className="absolute left-0 right-0 h-px bg-cyan-400 pointer-events-none z-20"
                  style={{ top: `${g.position * stageDisplayScale}px` }}
                />
              ),
            )}

          {/* Transform Gizmo Overlay (Edit Mode) */}
          {selectedRect && selectedNode && !selectedNode.locked && selectedNode.transform.anchor !== 'stretch' && (
            <div
              data-testid="transform-gizmo"
              className="absolute border border-cyan-400 pointer-events-none z-30"
              style={{
                left: selectedRect.x * stageDisplayScale,
                top: selectedRect.y * stageDisplayScale,
                width: selectedRect.width * stageDisplayScale,
                height: selectedRect.height * stageDisplayScale,
                transform: `rotate(${selectedRect.rotation}deg)`,
              }}
            >
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-px h-6 bg-cyan-400" />
              <button
                type="button"
                aria-label="Rotate layer"
                onPointerDown={(e) => startDrag(e, 'rotate', selectedNode)}
                className="pointer-events-auto absolute -top-7 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-cyan-400 border border-white cursor-grab"
              />

              {(
                [
                  ['nw', '-top-1.5 -left-1.5 cursor-nwse-resize'],
                  ['n', '-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize'],
                  ['ne', '-top-1.5 -right-1.5 cursor-nesw-resize'],
                  ['e', 'top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize'],
                  ['se', '-bottom-1.5 -right-1.5 cursor-nwse-resize'],
                  ['s', '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize'],
                  ['sw', '-bottom-1.5 -left-1.5 cursor-nesw-resize'],
                  ['w', 'top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize'],
                ] as [DragKind, string][]
              ).map(([dir, posClass]) => (
                <button
                  key={dir}
                  type="button"
                  aria-label={`Resize ${dir}`}
                  onPointerDown={(e) => startDrag(e, dir, selectedNode)}
                  className={`pointer-events-auto absolute w-2.5 h-2.5 bg-white border border-cyan-500 rounded-[1px] ${posClass}`}
                />
              ))}
            </div>
          )}

          {/* Centered Translucent Play Circle (matching reference screenshot) */}
          {!isPlaying && (
            <button
              type="button"
              aria-label="Play Scene"
              onClick={(e) => {
                e.stopPropagation();
                setIsPlaying(true);
              }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/25 flex items-center justify-center transition-transform hover:scale-105 cursor-pointer z-20"
            >
              <Play className="w-6 h-6 text-white fill-white ml-0.5" />
            </button>
          )}

          {/* Subtle Corner Timecode HUD */}
          <div className="absolute bottom-2.5 right-3 px-2 py-0.5 rounded bg-black/65 backdrop-blur-sm border border-white/[0.08] text-[11px] font-mono tabular-nums text-slate-300 pointer-events-none z-20">
            {formatTimecode(playheadMs, activeClip?.fps ?? 30)}
          </div>
        </div>

        {/* Quiet Top-Left Quick Tools (Undo / Redo / Snap / Proxy) */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-3 left-3 flex items-center gap-1 px-1.5 py-1 rounded-lg bg-black/55 backdrop-blur-md border border-white/[0.08] z-30"
        >
          <button
            type="button"
            disabled={undoCount === 0}
            onClick={undo}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-white/[0.08] disabled:opacity-30 text-slate-300 cursor-pointer disabled:cursor-not-allowed"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            disabled={redoCount === 0}
            onClick={redo}
            aria-label="Redo"
            title="Redo (Ctrl+Y)"
            className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-white/[0.08] disabled:opacity-30 text-slate-300 cursor-pointer disabled:cursor-not-allowed"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setSnapEnabled(!snapEnabled)}
            aria-label="Toggle snapping"
            aria-pressed={snapEnabled}
            title="Snap Guides"
            className={`w-6 h-6 inline-flex items-center justify-center rounded cursor-pointer ${
              snapEnabled ? 'text-teal-300 bg-teal-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
          </button>

          <select
            aria-label="Proxy resolution"
            title="Proxy Quality"
            value={proxyScale}
            onChange={(e) => setProxyScale(Number(e.target.value) as ProxyScale)}
            className="h-6 px-1 text-[11px] font-mono bg-transparent text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value={1} className="bg-[#121622]">1/1</option>
            <option value={0.5} className="bg-[#121622]">1/2</option>
            <option value={0.25} className="bg-[#121622]">1/4</option>
          </select>
        </div>

        {/* Floating Top-Right Reference Controls: View / Live Edit / Full Screen */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-3 right-3 flex items-center gap-1.5 z-30"
        >
          <button
            type="button"
            onClick={() => setEditorMode('edit')}
            className={`h-7 px-2.5 rounded-md inline-flex items-center gap-1.5 text-xs font-medium border backdrop-blur-md cursor-pointer whitespace-nowrap transition-colors ${
              editorMode === 'edit'
                ? 'bg-teal-500/30 border-teal-400/65 text-teal-200'
                : 'bg-black/55 border-white/[0.12] text-slate-300 hover:text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>View</span>
          </button>

          <button
            type="button"
            onClick={() => setEditorMode(editorMode === 'play' ? 'edit' : 'play')}
            className={`h-7 px-2.5 rounded-md inline-flex items-center gap-1.5 text-xs font-medium border backdrop-blur-md cursor-pointer whitespace-nowrap transition-colors ${
              editorMode === 'play'
                ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_12px_rgba(147,51,234,0.45)]'
                : 'bg-purple-600/75 hover:bg-purple-600 border-purple-400/50 text-white'
            }`}
          >
            <span>Live Edit</span>
          </button>

          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="h-7 px-2.5 rounded-md inline-flex items-center gap-1.5 text-xs font-medium bg-black/60 hover:bg-black/80 border border-white/[0.14] text-slate-200 backdrop-blur-md cursor-pointer whitespace-nowrap transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            <span>Full Screen</span>
          </button>
        </div>
      </div>
    </div>
  );
};
