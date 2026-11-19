import type { AnchorPreset, ClipSequence, ProjectData, RectTransform, SceneNode } from './types';

export interface ComputedRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface SnapGuide {
  axis: 'x' | 'y';
  position: number;
  kind: 'center' | 'edge';
}

export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

export function computeAnchoredRect(
  transform: RectTransform,
  stageWidth: number,
  stageHeight: number,
): ComputedRect {
  const { x, y, width, height, rotation, anchor } = transform;

  if (anchor === 'stretch') {
    return {
      x: 0,
      y: 0,
      width: stageWidth,
      height: stageHeight,
      rotation,
    };
  }

  let anchorX = 0;
  let anchorY = 0;

  if (anchor.includes('center')) anchorX = stageWidth / 2 - width / 2;
  else if (anchor.includes('right')) anchorX = stageWidth - width;

  if (anchor === 'center' || anchor.startsWith('middle')) anchorY = stageHeight / 2 - height / 2;
  else if (anchor.startsWith('bottom')) anchorY = stageHeight - height;

  return {
    x: anchorX + x,
    y: anchorY + y,
    width,
    height,
    rotation,
  };
}

/**
 * Converts a resolved canvas pixel position back into offset coordinates relative to the chosen anchor.
 */
export function canvasPosToAnchorOffset(
  canvasX: number,
  canvasY: number,
  width: number,
  height: number,
  anchor: AnchorPreset,
  stageWidth: number,
  stageHeight: number,
): { x: number; y: number } {
  if (anchor === 'stretch') return { x: 0, y: 0 };

  let anchorX = 0;
  let anchorY = 0;

  if (anchor.includes('center')) anchorX = stageWidth / 2 - width / 2;
  else if (anchor.includes('right')) anchorX = stageWidth - width;

  if (anchor === 'center' || anchor.startsWith('middle')) anchorY = stageHeight / 2 - height / 2;
  else if (anchor.startsWith('bottom')) anchorY = stageHeight - height;

  return {
    x: Math.round(canvasX - anchorX),
    y: Math.round(canvasY - anchorY),
  };
}

export function isNodeActiveAtTime(node: SceneNode, timeMs: number): boolean {
  if (!node.visible) return false;
  return timeMs >= node.startTime && timeMs <= node.startTime + node.duration;
}

export function computeSnapGuides(
  dragRect: { x: number; y: number; width: number; height: number },
  otherRects: { x: number; y: number; width: number; height: number }[],
  stageWidth: number,
  stageHeight: number,
  threshold = 8,
): SnapResult {
  let snappedX = dragRect.x;
  let snappedY = dragRect.y;
  const guides: SnapGuide[] = [];

  const xTargets: { pos: number; kind: 'center' | 'edge' }[] = [
    { pos: stageWidth / 2, kind: 'center' },
    { pos: 0, kind: 'edge' },
    { pos: stageWidth, kind: 'edge' },
  ];
  const yTargets: { pos: number; kind: 'center' | 'edge' }[] = [
    { pos: stageHeight / 2, kind: 'center' },
    { pos: 0, kind: 'edge' },
    { pos: stageHeight, kind: 'edge' },
  ];

  for (const r of otherRects) {
    xTargets.push(
      { pos: r.x, kind: 'edge' },
      { pos: r.x + r.width / 2, kind: 'center' },
      { pos: r.x + r.width, kind: 'edge' },
    );
    yTargets.push(
      { pos: r.y, kind: 'edge' },
      { pos: r.y + r.height / 2, kind: 'center' },
      { pos: r.y + r.height, kind: 'edge' },
    );
  }

  let bestDx = threshold + 1;
  let bestXGuide: SnapGuide | null = null;
  const dragXPoints = [
    { offset: 0, val: dragRect.x },
    { offset: dragRect.width / 2, val: dragRect.x + dragRect.width / 2 },
    { offset: dragRect.width, val: dragRect.x + dragRect.width },
  ];

  for (const pt of dragXPoints) {
    for (const target of xTargets) {
      const dist = Math.abs(pt.val - target.pos);
      if (dist <= threshold && dist < bestDx) {
        bestDx = dist;
        snappedX = target.pos - pt.offset;
        bestXGuide = { axis: 'x', position: target.pos, kind: target.kind };
      }
    }
  }
  if (bestXGuide) guides.push(bestXGuide);

  let bestDy = threshold + 1;
  let bestYGuide: SnapGuide | null = null;
  const dragYPoints = [
    { offset: 0, val: dragRect.y },
    { offset: dragRect.height / 2, val: dragRect.y + dragRect.height / 2 },
    { offset: dragRect.height, val: dragRect.y + dragRect.height },
  ];

  for (const pt of dragYPoints) {
    for (const target of yTargets) {
      const dist = Math.abs(pt.val - target.pos);
      if (dist <= threshold && dist < bestDy) {
        bestDy = dist;
        snappedY = target.pos - pt.offset;
        bestYGuide = { axis: 'y', position: target.pos, kind: target.kind };
      }
    }
  }
  if (bestYGuide) guides.push(bestYGuide);

  return { x: snappedX, y: snappedY, guides };
}

export function formatTimecode(ms: number, fps = 30): string {
  const safeMs = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const remMs = safeMs % 1000;
  const frames = Math.min(fps - 1, Math.floor((remMs / 1000) * fps));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}.${pad(frames)}`;
}

export function msToPixels(ms: number, pxPerSec: number): number {
  return (ms / 1000) * pxPerSec;
}

export function pixelsToMs(px: number, pxPerSec: number): number {
  return Math.max(0, Math.round((px / pxPerSec) * 1000));
}

export function collectUsedAssetIds(project: ProjectData): {
  usedIds: string[];
  unusedIds: string[];
} {
  const usedSet = new Set<string>();
  for (const clip of Object.values(project.clips)) {
    for (const node of Object.values(clip.nodes)) {
      for (const comp of node.components) {
        if (!comp.enabled) continue;
        const assetId = comp.params.assetId;
        if (typeof assetId === 'string' && assetId && project.assets[assetId]) {
          usedSet.add(assetId);
        }
      }
    }
  }

  const allIds = Object.keys(project.assets);
  return {
    usedIds: allIds.filter((id) => usedSet.has(id)),
    unusedIds: allIds.filter((id) => !usedSet.has(id)),
  };
}

export function getClipBranchEdges(
  clips: Record<string, ClipSequence>,
): { fromClipId: string; toClipId: string; label: string; triggerType: string }[] {
  const edges: { fromClipId: string; toClipId: string; label: string; triggerType: string }[] = [];
  for (const clip of Object.values(clips)) {
    for (const node of Object.values(clip.nodes)) {
      const btn = node.components.find((c) => c.type === 'InteractiveButton' && c.enabled);
      for (const comp of node.components) {
        if (comp.type === 'EventTrigger' && comp.enabled && comp.params.actionType === 'JumpToClip') {
          const targetId = String(comp.params.targetClipId ?? '');
          if (targetId && clips[targetId]) {
            edges.push({
              fromClipId: clip.id,
              toClipId: targetId,
              label: btn ? String(btn.params.label ?? node.name) : node.name,
              triggerType: String(comp.params.triggerType ?? 'OnClick'),
            });
          }
        }
      }
    }
  }
  return edges;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
