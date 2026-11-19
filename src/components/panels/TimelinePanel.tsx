import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Mic,
  MousePointerClick,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Square,
  Type,
  Video,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { formatTimecode, msToPixels, pixelsToMs } from '../../engine/sceneMath';
import type { SceneNode } from '../../engine/types';
import { useStudioStore } from '../../store/useStudioStore';

interface TimelineDrag {
  nodeId: string;
  mode: 'move' | 'trim-left' | 'trim-right';
  startX: number;
  origStart: number;
  origDuration: number;
  beforeProject: ReturnType<typeof useStudioStore.getState>['project'];
}

const TimelineTimecodeBadge: React.FC<{ durationMs: number; fps: number }> = ({ durationMs, fps }) => {
  const playheadMs = useStudioStore((s) => s.playheadMs);
  return (
    <div className="font-mono text-[11px] tabular-nums text-cyan-300 whitespace-nowrap">
      {formatTimecode(playheadMs, fps)} <span className="text-slate-500">/ {formatTimecode(durationMs, fps)}</span>
    </div>
  );
};

const TimelinePlayheadNeedle: React.FC<{ zoomPxPerSec: number }> = ({ zoomPxPerSec }) => {
  const playheadMs = useStudioStore((s) => s.playheadMs);
  return (
    <div
      className="absolute top-0 bottom-0 w-[1.5px] bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)] pointer-events-none z-30"
      style={{ left: `${msToPixels(playheadMs, zoomPxPerSec)}px` }}
    >
      <div className="w-2.5 h-3 bg-cyan-400 -translate-x-1/2 rounded-b-full -mt-0.5" />
    </div>
  );
};

export const TimelinePanel: React.FC = () => {
  const project = useStudioStore((s) => s.project);
  const activeClipId = useStudioStore((s) => s.activeClipId);
  const selectedNodeId = useStudioStore((s) => s.selectedNodeId);
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const snapEnabled = useStudioStore((s) => s.snapEnabled);
  const zoomPxPerSec = useStudioStore((s) => s.timelineZoomPxPerSec);

  const setPlayheadMs = useStudioStore((s) => s.setPlayheadMs);
  const setIsPlaying = useStudioStore((s) => s.setIsPlaying);
  const setSnapEnabled = useStudioStore((s) => s.setSnapEnabled);
  const setTimelineZoom = useStudioStore((s) => s.setTimelineZoom);
  const selectNode = useStudioStore((s) => s.selectNode);
  const updateNodeMeta = useStudioStore((s) => s.updateNodeMeta);
  const commitHistorySnapshot = useStudioStore((s) => s.commitHistorySnapshot);
  const createSceneNode = useStudioStore((s) => s.createSceneNode);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(800);
  const [scrubbing, setScrubbing] = useState(false);
  const [clipDrag, setClipDrag] = useState<TimelineDrag | null>(null);

  const activeClip = project.clips[activeClipId];
  const durationMs = activeClip?.durationMs ?? 8000;
  const fps = activeClip?.fps ?? 30;
  const totalWidthPx = Math.max(600, msToPixels(durationMs + 1000, zoomPxPerSec));

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const measure = () => setViewportWidth(el.clientWidth || 800);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nodes = useMemo(() => {
    if (!activeClip) return [];
    const ordered: SceneNode[] = [];
    const visit = (id: string) => {
      const n = activeClip.nodes[id];
      if (!n) return;
      ordered.push(n);
      for (const cid of n.children) visit(cid);
    };
    for (const rid of activeClip.rootNodeIds) visit(rid);
    return ordered;
  }, [activeClip]);

  useEffect(() => {
    if (!scrubbing) return;
    const handleMove = (e: PointerEvent) => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left + el.scrollLeft;
      setPlayheadMs(pixelsToMs(x, zoomPxPerSec));
    };
    const handleUp = () => setScrubbing(false);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [scrubbing, zoomPxPerSec, setPlayheadMs]);

  useEffect(() => {
    if (!clipDrag) return;
    const handleMove = (e: PointerEvent) => {
      const dx = e.clientX - clipDrag.startX;
      const deltaMs = Math.round((dx / zoomPxPerSec) * 1000);
      if (clipDrag.mode === 'move') {
        const nextStart = Math.max(0, clipDrag.origStart + deltaMs);
        updateNodeMeta(activeClipId, clipDrag.nodeId, { startTime: nextStart }, false);
      } else if (clipDrag.mode === 'trim-right') {
        const nextDur = Math.max(250, clipDrag.origDuration + deltaMs);
        updateNodeMeta(activeClipId, clipDrag.nodeId, { duration: nextDur }, false);
      } else {
        const maxShift = clipDrag.origDuration - 250;
        const clampedDelta = Math.min(maxShift, Math.max(-clipDrag.origStart, deltaMs));
        updateNodeMeta(
          activeClipId,
          clipDrag.nodeId,
          {
            startTime: clipDrag.origStart + clampedDelta,
            duration: clipDrag.origDuration - clampedDelta,
          },
          false,
        );
      }
    };
    const handleUp = () => {
      commitHistorySnapshot('Timeline Clip Edit', clipDrag.beforeProject);
      setClipDrag(null);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [clipDrag, zoomPxPerSec, activeClipId, updateNodeMeta, commitHistorySnapshot]);

  const visibleStartMs = pixelsToMs(Math.max(0, scrollLeft - 100), zoomPxPerSec);
  const visibleEndMs = pixelsToMs(scrollLeft + viewportWidth + 100, zoomPxPerSec);
  const firstSecond = Math.floor(visibleStartMs / 1000);
  const lastSecond = Math.ceil(Math.min(durationMs + 1000, visibleEndMs) / 1000);
  const rulerSeconds: number[] = [];
  for (let s = firstSecond; s <= lastSecond; s++) rulerSeconds.push(s);

  const getTrackAppearance = (node: SceneNode) => {
    if (node.trackKind === 'audio') {
      return {
        label: 'Voice',
        icon: <Mic className="w-3.5 h-3.5 text-slate-400 shrink-0" />,
        barClass: 'bg-purple-600/35 border-purple-400/80 text-purple-100',
      };
    }
    if (node.trackKind === 'video') {
      return {
        label: 'Video',
        icon: <Video className="w-3.5 h-3.5 text-slate-400 shrink-0" />,
        barClass: 'bg-cyan-500/25 border-cyan-400/85 text-cyan-100',
      };
    }
    if (node.trackKind === 'effect') {
      return {
        label: 'Marker',
        icon: <Bookmark className="w-3.5 h-3.5 text-slate-400 shrink-0" />,
        barClass: 'bg-orange-500/30 border-orange-400/80 text-orange-100',
      };
    }
    const isText = node.components.some((c) => c.type === 'TextRenderer');
    if (isText) {
      return {
        label: 'Text',
        icon: <Type className="w-3.5 h-3.5 text-slate-400 shrink-0" />,
        barClass: 'bg-amber-600/30 border-amber-500/75 text-amber-100',
      };
    }
    return {
      label: 'Button',
      icon: <MousePointerClick className="w-3.5 h-3.5 text-slate-400 shrink-0" />,
      barClass: 'bg-blue-600/30 border-blue-400/80 text-blue-100',
    };
  };

  return (
    <div className="h-full flex flex-col bg-[#121622] text-slate-200 select-none">
      {/* Transport & Zoom Bar matching reference screenshot */}
      <div className="h-9 px-3 border-b border-white/[0.06] bg-[#131826] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <TimelineTimecodeBadge durationMs={durationMs} fps={fps} />
          <span className="text-[10px] font-mono tabular-nums text-slate-500 hidden sm:inline">{fps} FPS</span>
        </div>

        {/* Centered Transport Icons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Jump to Start"
            onClick={() => {
              setIsPlaying(false);
              setPlayheadMs(0);
            }}
            className="p-1.5 rounded hover:bg-white/[0.06] text-slate-300 hover:text-white cursor-pointer transition-colors"
          >
            <SkipBack className="w-3.5 h-3.5 fill-current" />
          </button>

          <button
            type="button"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-1.5 rounded hover:bg-white/[0.08] cursor-pointer transition-colors ${
              isPlaying ? 'text-cyan-300' : 'text-slate-100'
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
          </button>

          <button
            type="button"
            aria-label="Stop"
            onClick={() => {
              setIsPlaying(false);
              setPlayheadMs(0);
            }}
            className="p-1.5 rounded hover:bg-white/[0.06] text-slate-400 hover:text-white cursor-pointer transition-colors"
          >
            <Square className="w-3 h-3" />
          </button>

          <button
            type="button"
            aria-label="Step Forward 1 Frame"
            onClick={() => setPlayheadMs(useStudioStore.getState().playheadMs + Math.round(1000 / fps))}
            className="p-1.5 rounded hover:bg-white/[0.06] text-slate-300 hover:text-white cursor-pointer transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5 fill-current" />
          </button>
        </div>

        {/* Right Snap + Cyan Zoom Slider */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Snap Toggle"
            title="Toggle Snap"
            onClick={() => setSnapEnabled(!snapEnabled)}
            className={`p-1 rounded cursor-pointer transition-colors ${
              snapEnabled ? 'text-cyan-300' : 'text-slate-500 hover:text-slate-200'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            aria-label="Zoom Out"
            onClick={() => setTimelineZoom(zoomPxPerSec - 20)}
            className="p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <input
            type="range"
            aria-label="Timeline Zoom"
            min={40}
            max={300}
            value={zoomPxPerSec}
            onChange={(e) => setTimelineZoom(Number(e.target.value))}
            className="w-20 studio-slider cursor-pointer"
          />

          <button
            type="button"
            aria-label="Zoom In"
            onClick={() => setTimelineZoom(zoomPxPerSec + 20)}
            className="p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Split: Track Headers + Scrollable Ruler & Colored Track Bars */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Track Headers */}
        <div className="w-36 shrink-0 border-r border-white/[0.06] bg-[#101420] flex flex-col">
          <div className="h-6 px-3 border-b border-white/[0.05] flex items-center text-[10px] font-medium text-slate-500 uppercase tracking-wider">
            Tracks
          </div>
          <div className="flex-1 overflow-y-auto py-1 space-y-0.5">
            {nodes.map((node) => {
              const appearance = getTrackAppearance(node);
              const isSelected = selectedNodeId === node.id;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => selectNode(node.id)}
                  className={`w-[calc(100%-8px)] mx-1 h-8 px-2.5 rounded-md flex items-center justify-between gap-2 text-left cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-cyan-500/12 border border-cyan-400/70 text-white'
                      : 'border border-transparent text-slate-300 hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="text-xs font-medium truncate" title={node.name}>
                    {node.name}
                  </span>
                  {appearance.icon}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Scrollable Ruler & Bars */}
        <div
          ref={scrollContainerRef}
          onScroll={(e) => setScrollLeft((e.target as HTMLDivElement).scrollLeft)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const assetId = e.dataTransfer.getData('application/x-kinoforge-asset');
            if (assetId && project.assets[assetId]) {
              const asset = project.assets[assetId];
              createSceneNode(asset.kind === 'audio' ? 'audio' : 'video', assetId);
            }
          }}
          className="flex-1 overflow-auto relative bg-[#0c0f18]"
        >
          <div className="relative min-h-full" style={{ width: `${totalWidthPx}px` }}>
            {/* Scrubbing Ruler */}
            <div
              role="slider"
              aria-label="Timeline Scrub Ruler"
              aria-valuemin={0}
              aria-valuemax={durationMs}
              aria-valuenow={0}
              tabIndex={0}
              onPointerDown={(e) => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                setPlayheadMs(pixelsToMs(e.clientX - rect.left, zoomPxPerSec));
                setScrubbing(true);
              }}
              className="h-6 border-b border-white/[0.05] bg-[#101420] relative cursor-ew-resize sticky top-0 z-20"
            >
              {rulerSeconds.map((sec) => {
                const left = msToPixels(sec * 1000, zoomPxPerSec);
                return (
                  <div
                    key={sec}
                    className="absolute top-0 bottom-0 border-l border-white/[0.07] pl-1 text-[10px] font-mono tabular-nums text-slate-500 flex items-center"
                    style={{ left: `${left}px` }}
                  >
                    {sec}s
                  </div>
                );
              })}
            </div>

            {/* Track Lanes */}
            <div className="relative py-1 space-y-0.5">
              {nodes.map((node) => {
                const barLeft = msToPixels(node.startTime, zoomPxPerSec);
                const barWidth = Math.max(24, msToPixels(node.duration, zoomPxPerSec));
                const isVisibleInViewport =
                  barLeft + barWidth >= scrollLeft - 120 && barLeft <= scrollLeft + viewportWidth + 120;
                const audioComp = node.components.find((c) => c.type === 'AudioEmitter');
                const audioAsset = audioComp ? project.assets[String(audioComp.params.assetId ?? '')] : undefined;
                const appearance = getTrackAppearance(node);

                return (
                  <div key={node.id} className="h-8 border-b border-white/[0.03] relative">
                    {isVisibleInViewport && (
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          selectNode(node.id);
                          setClipDrag({
                            nodeId: node.id,
                            mode: 'move',
                            startX: e.clientX,
                            origStart: node.startTime,
                            origDuration: node.duration,
                            beforeProject: JSON.parse(JSON.stringify(project)),
                          });
                        }}
                        className={`absolute top-1 bottom-1 rounded-md border flex items-center overflow-hidden cursor-grab active:cursor-grabbing ${appearance.barClass} ${
                          selectedNodeId === node.id ? 'ring-1 ring-white/70' : ''
                        }`}
                        style={{ left: `${barLeft}px`, width: `${barWidth}px` }}
                      >
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setClipDrag({
                              nodeId: node.id,
                              mode: 'trim-left',
                              startX: e.clientX,
                              origStart: node.startTime,
                              origDuration: node.duration,
                              beforeProject: JSON.parse(JSON.stringify(project)),
                            });
                          }}
                          className="w-1.5 h-full bg-white/10 hover:bg-white/35 cursor-ew-resize shrink-0"
                        />

                        <div className="flex-1 min-w-0 px-2 flex items-center justify-between gap-2 relative h-full">
                          {audioAsset?.waveform && (
                            <div className="absolute inset-0 flex items-end gap-px px-1 opacity-30 pointer-events-none">
                              {audioAsset.waveform.slice(0, 40).map((pk, idx) => (
                                <div
                                  key={idx}
                                  className="flex-1 bg-purple-300"
                                  style={{ height: `${Math.round(pk * 100)}%` }}
                                />
                              ))}
                            </div>
                          )}
                          <span className="text-[11px] font-medium truncate relative z-10">{node.name}</span>
                          <span className="text-[10px] font-mono tabular-nums opacity-75 shrink-0 relative z-10">
                            {(node.duration / 1000).toFixed(1)}s
                          </span>
                        </div>

                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setClipDrag({
                              nodeId: node.id,
                              mode: 'trim-right',
                              startX: e.clientX,
                              origStart: node.startTime,
                              origDuration: node.duration,
                              beforeProject: JSON.parse(JSON.stringify(project)),
                            });
                          }}
                          className="w-1.5 h-full bg-white/10 hover:bg-white/35 cursor-ew-resize shrink-0"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <TimelinePlayheadNeedle zoomPxPerSec={zoomPxPerSec} />
          </div>
        </div>
      </div>
    </div>
  );
};
