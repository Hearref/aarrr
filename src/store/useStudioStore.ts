import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createInitialDemoProject } from '../data/demoProject';
import { createComponentInstance, executeSafeAction } from '../engine/iscRegistry';
import type { BuildIntOutput } from '../engine/intFormat';
import type {
  AssetItem,
  EditorMode,
  IscComponentType,
  ProjectData,
  ProxyScale,
  RectTransform,
  RuntimeVariableValue,
  SceneNode,
  TrackKind,
  WorkspaceView,
} from '../engine/types';

interface HistorySnapshot {
  label: string;
  project: ProjectData;
}

interface StudioState {
  project: ProjectData;
  activeClipId: string;
  selectedNodeId: string | null;
  playheadMs: number;
  isPlaying: boolean;
  editorMode: EditorMode;
  proxyScale: ProxyScale;
  snapEnabled: boolean;
  workspaceView: WorkspaceView;
  activeFolder: string;
  timelineZoomPxPerSec: number;

  // Runtime state for Play Mode
  runtimeVariables: Record<string, RuntimeVariableValue>;
  hiddenNodeIds: Record<string, boolean>;

  // Binary payload cache for local/OPFS assets & built .int output
  assetPayloads: Record<string, Uint8Array>;
  lastBuiltInt: BuildIntOutput | null;
  buildModalOpen: boolean;

  // Command Pattern Undo / Redo
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];

  // Actions
  setWorkspaceView: (view: WorkspaceView) => void;
  setEditorMode: (mode: EditorMode) => void;
  setProxyScale: (scale: ProxyScale) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setTimelineZoom: (pxPerSec: number) => void;
  setActiveFolder: (folder: string) => void;
  setBuildModalOpen: (open: boolean) => void;
  setLastBuiltInt: (output: BuildIntOutput | null) => void;

  selectClip: (clipId: string) => void;
  addClip: (name: string) => void;
  selectNode: (nodeId: string | null) => void;

  setPlayheadMs: (ms: number) => void;
  setIsPlaying: (playing: boolean) => void;
  stepPlayhead: (deltaMs: number) => void;

  // Command-tracked mutations
  undo: () => void;
  redo: () => void;
  updateNodeTransform: (clipId: string, nodeId: string, patch: Partial<RectTransform>, recordHistory?: boolean) => void;
  updateNodeMeta: (clipId: string, nodeId: string, patch: Partial<Pick<SceneNode, 'name' | 'visible' | 'locked' | 'startTime' | 'duration'>>, recordHistory?: boolean) => void;
  updateComponentParams: (clipId: string, nodeId: string, compId: string, paramPatch: Record<string, unknown>, recordHistory?: boolean) => void;
  toggleComponentEnabled: (clipId: string, nodeId: string, compId: string) => void;
  addComponentToNode: (clipId: string, nodeId: string, type: IscComponentType) => void;
  removeComponentFromNode: (clipId: string, nodeId: string, compId: string) => void;
  createSceneNode: (kind: 'video' | 'ui' | 'text' | 'audio' | 'effect', assetId?: string, parentId?: string | null) => void;
  deleteSceneNode: (clipId: string, nodeId: string) => void;
  commitHistorySnapshot: (label: string, beforeProject: ProjectData) => void;

  // Asset / OPFS
  registerImportedAsset: (asset: AssetItem, bytes: Uint8Array) => void;
  deleteAsset: (assetId: string) => void;
  createFolder: (folderName: string) => void;

  // Safe Interactive Trigger execution
  triggerNodeEvent: (clipId: string, nodeId: string, triggerType: 'OnClick' | 'OnHover' | 'OnTimeReach') => void;
  resetRuntimeState: () => void;
  updateProjectMetadata: (patch: Partial<ProjectData['metadata']>) => void;
}

function cloneProject(p: ProjectData): ProjectData {
  return JSON.parse(JSON.stringify(p)) as ProjectData;
}

const initialProject = createInitialDemoProject();

export const useStudioStore = create<StudioState>()(
  immer((set, get) => ({
    project: initialProject,
    activeClipId: initialProject.metadata.entryClipId,
    selectedNodeId: 'c1-btn-control',
    playheadMs: 1200,
    isPlaying: false,
    editorMode: 'edit',
    proxyScale: 1,
    snapEnabled: true,
    workspaceView: 'studio',
    activeFolder: '/',
    timelineZoomPxPerSec: 65,

    runtimeVariables: { ...initialProject.initialVariables },
    hiddenNodeIds: {},
    assetPayloads: {},
    lastBuiltInt: null,
    buildModalOpen: false,

    undoStack: [],
    redoStack: [],

    setWorkspaceView: (view) => set((s) => { s.workspaceView = view; }),
    setEditorMode: (mode) =>
      set((s) => {
        s.editorMode = mode;
        if (mode === 'play') {
          s.runtimeVariables = { ...s.project.initialVariables };
          s.hiddenNodeIds = {};
          s.isPlaying = true;
        } else {
          s.isPlaying = false;
          s.hiddenNodeIds = {};
        }
      }),
    setProxyScale: (scale) => set((s) => { s.proxyScale = scale; }),
    setSnapEnabled: (enabled) => set((s) => { s.snapEnabled = enabled; }),
    setTimelineZoom: (pxPerSec) => set((s) => { s.timelineZoomPxPerSec = Math.max(40, Math.min(320, pxPerSec)); }),
    setActiveFolder: (folder) => set((s) => { s.activeFolder = folder; }),
    setBuildModalOpen: (open) => set((s) => { s.buildModalOpen = open; }),
    setLastBuiltInt: (output) => set((s) => { s.lastBuiltInt = output; }),

    selectClip: (clipId) =>
      set((s) => {
        if (!s.project.clips[clipId]) return;
        s.activeClipId = clipId;
        s.playheadMs = 0;
        const firstRoot = s.project.clips[clipId].rootNodeIds[0] ?? null;
        s.selectedNodeId = firstRoot;
      }),

    addClip: (name) =>
      set((s) => {
        const before = cloneProject(s.project);
        s.undoStack.push({ label: `Sahne Ekle: ${name}`, project: before });
        if (s.undoStack.length > 50) s.undoStack.shift();
        s.redoStack = [];

        const id = `clip-${Date.now().toString(36)}`;
        const count = s.project.clipOrder.length;
        s.project.clips[id] = {
          id,
          name: name.trim() || `Sahne ${count + 1}`,
          durationMs: 6000,
          fps: s.project.metadata.fps,
          position: { x: 100 + count * 280, y: 140 },
          rootNodeIds: [],
          nodes: {},
        };
        s.project.clipOrder.push(id);
        s.activeClipId = id;
        s.playheadMs = 0;
        s.selectedNodeId = null;
      }),

    selectNode: (nodeId) => set((s) => { s.selectedNodeId = nodeId; }),

    setPlayheadMs: (ms) =>
      set((s) => {
        const clip = s.project.clips[s.activeClipId];
        const max = clip ? clip.durationMs : 10000;
        s.playheadMs = Math.max(0, Math.min(max, Math.round(ms)));
      }),

    setIsPlaying: (playing) => set((s) => { s.isPlaying = playing; }),

    stepPlayhead: (deltaMs) =>
      set((s) => {
        const clip = s.project.clips[s.activeClipId];
        if (!clip) return;
        let next = s.playheadMs + deltaMs;
        if (next >= clip.durationMs) {
          next = 0;
        }
        s.playheadMs = Math.max(0, Math.round(next));
      }),

    commitHistorySnapshot: (label, beforeProject) =>
      set((s) => {
        s.undoStack.push({ label, project: cloneProject(beforeProject) });
        if (s.undoStack.length > 50) s.undoStack.shift();
        s.redoStack = [];
      }),

    undo: () =>
      set((s) => {
        const prev = s.undoStack.pop();
        if (!prev) return;
        s.redoStack.push({ label: prev.label, project: cloneProject(s.project) });
        s.project = prev.project;
        if (!s.project.clips[s.activeClipId]) {
          s.activeClipId = s.project.clipOrder[0];
        }
      }),

    redo: () =>
      set((s) => {
        const next = s.redoStack.pop();
        if (!next) return;
        s.undoStack.push({ label: next.label, project: cloneProject(s.project) });
        s.project = next.project;
        if (!s.project.clips[s.activeClipId]) {
          s.activeClipId = s.project.clipOrder[0];
        }
      }),

    updateNodeTransform: (clipId, nodeId, patch, recordHistory = true) =>
      set((s) => {
        const node = s.project.clips[clipId]?.nodes[nodeId];
        if (!node) return;
        if (recordHistory) {
          s.undoStack.push({ label: `Transform: ${node.name}`, project: cloneProject(s.project) });
          if (s.undoStack.length > 50) s.undoStack.shift();
          s.redoStack = [];
        }
        Object.assign(node.transform, patch);
      }),

    updateNodeMeta: (clipId, nodeId, patch, recordHistory = true) =>
      set((s) => {
        const clip = s.project.clips[clipId];
        const node = clip?.nodes[nodeId];
        if (!node || !clip) return;
        if (recordHistory) {
          s.undoStack.push({ label: `Özellik: ${node.name}`, project: cloneProject(s.project) });
          if (s.undoStack.length > 50) s.undoStack.shift();
          s.redoStack = [];
        }
        Object.assign(node, patch);
        if (node.startTime < 0) node.startTime = 0;
        if (node.duration < 200) node.duration = 200;
        if (node.startTime + node.duration > clip.durationMs) {
          clip.durationMs = node.startTime + node.duration;
        }
      }),

    updateComponentParams: (clipId, nodeId, compId, paramPatch, recordHistory = true) =>
      set((s) => {
        const node = s.project.clips[clipId]?.nodes[nodeId];
        const comp = node?.components.find((c) => c.id === compId);
        if (!node || !comp) return;
        if (recordHistory) {
          s.undoStack.push({ label: `${comp.type} Düzenle`, project: cloneProject(s.project) });
          if (s.undoStack.length > 50) s.undoStack.shift();
          s.redoStack = [];
        }
        Object.assign(comp.params, paramPatch);
      }),

    toggleComponentEnabled: (clipId, nodeId, compId) =>
      set((s) => {
        const node = s.project.clips[clipId]?.nodes[nodeId];
        const comp = node?.components.find((c) => c.id === compId);
        if (!comp) return;
        s.undoStack.push({ label: `${comp.type} Aç/Kapat`, project: cloneProject(s.project) });
        s.redoStack = [];
        comp.enabled = !comp.enabled;
      }),

    addComponentToNode: (clipId, nodeId, type) =>
      set((s) => {
        const node = s.project.clips[clipId]?.nodes[nodeId];
        if (!node) return;
        s.undoStack.push({ label: `Bileşen Ekle: ${type}`, project: cloneProject(s.project) });
        s.redoStack = [];
        node.components.push(createComponentInstance(type));
      }),

    removeComponentFromNode: (clipId, nodeId, compId) =>
      set((s) => {
        const node = s.project.clips[clipId]?.nodes[nodeId];
        if (!node) return;
        s.undoStack.push({ label: 'Bileşen Kaldır', project: cloneProject(s.project) });
        s.redoStack = [];
        node.components = node.components.filter((c) => c.id !== compId);
      }),

    createSceneNode: (kind, assetId, parentId = null) =>
      set((s) => {
        const clip = s.project.clips[s.activeClipId];
        if (!clip) return;
        s.undoStack.push({ label: `Katman Ekle (${kind})`, project: cloneProject(s.project) });
        s.redoStack = [];

        const id = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
        const asset = assetId ? s.project.assets[assetId] : undefined;
        let trackKind: TrackKind = 'ui';
        let name = 'Yeni Katman';
        let transform = { x: 0, y: 0, width: 320, height: 68, rotation: 0, anchor: 'center' as SceneNode['transform']['anchor'] };
        const components = [];

        if (kind === 'video') {
          trackKind = 'video';
          name = asset ? asset.name : 'Video / Görsel Katmanı';
          transform = { x: 0, y: 0, width: 1280, height: 720, rotation: 0, anchor: 'stretch' };
          components.push(createComponentInstance('VideoSource', { assetId: assetId ?? '', trimOutMs: asset?.durationMs ?? 5000 }));
        } else if (kind === 'audio') {
          trackKind = 'audio';
          name = asset ? asset.name : 'Ses Katmanı';
          transform = { x: 40, y: 40, width: 180, height: 48, rotation: 0, anchor: 'top-left' };
          components.push(createComponentInstance('AudioEmitter', { assetId: assetId ?? '' }));
        } else if (kind === 'ui') {
          trackKind = 'ui';
          name = 'İnteraktif Buton';
          transform = { x: 0, y: -80, width: 300, height: 64, rotation: 0, anchor: 'bottom-center' };
          components.push(createComponentInstance('InteractiveButton', { label: 'Yeni Seçenek' }));
          components.push(createComponentInstance('EventTrigger', { targetClipId: s.project.clipOrder[0] ?? '' }));
        } else if (kind === 'text') {
          trackKind = 'ui';
          name = 'Metin Katmanı';
          transform = { x: 64, y: 64, width: 520, height: 84, rotation: 0, anchor: 'top-left' };
          components.push(createComponentInstance('TextRenderer', { text: 'Yeni sahne metni...' }));
        } else {
          trackKind = 'effect';
          name = 'Materyal Efekti';
          transform = { x: 0, y: 0, width: 1280, height: 720, rotation: 0, anchor: 'stretch' };
          components.push(createComponentInstance('MaterialEffect'));
        }

        const newNode: SceneNode = {
          id,
          name,
          parentId,
          children: [],
          visible: true,
          locked: false,
          trackKind,
          startTime: 0,
          duration: Math.min(clip.durationMs, asset?.durationMs ?? clip.durationMs),
          transform,
          components,
        };

        clip.nodes[id] = newNode;
        if (parentId && clip.nodes[parentId]) {
          clip.nodes[parentId].children.push(id);
        } else {
          clip.rootNodeIds.push(id);
        }
        s.selectedNodeId = id;
      }),

    deleteSceneNode: (clipId, nodeId) =>
      set((s) => {
        const clip = s.project.clips[clipId];
        const node = clip?.nodes[nodeId];
        if (!clip || !node) return;
        s.undoStack.push({ label: `Sil: ${node.name}`, project: cloneProject(s.project) });
        s.redoStack = [];

        const removeRecursive = (id: string) => {
          const n = clip.nodes[id];
          if (!n) return;
          for (const cid of n.children) removeRecursive(cid);
          delete clip.nodes[id];
        };

        if (node.parentId && clip.nodes[node.parentId]) {
          clip.nodes[node.parentId].children = clip.nodes[node.parentId].children.filter((id) => id !== nodeId);
        } else {
          clip.rootNodeIds = clip.rootNodeIds.filter((id) => id !== nodeId);
        }
        removeRecursive(nodeId);
        if (s.selectedNodeId === nodeId) {
          s.selectedNodeId = clip.rootNodeIds[0] ?? null;
        }
      }),

    registerImportedAsset: (asset, bytes) =>
      set((s) => {
        s.project.assets[asset.id] = asset;
        s.assetPayloads[asset.id] = bytes;
        if (!s.project.folders.includes(asset.folder)) {
          s.project.folders.push(asset.folder);
        }
      }),

    deleteAsset: (assetId) =>
      set((s) => {
        if (!s.project.assets[assetId]) return;
        delete s.project.assets[assetId];
        delete s.assetPayloads[assetId];
      }),

    createFolder: (folderName) =>
      set((s) => {
        const normalized = folderName.startsWith('/') ? folderName : `/${folderName}`;
        if (!s.project.folders.includes(normalized)) {
          s.project.folders.push(normalized);
        }
        s.activeFolder = normalized;
      }),

    triggerNodeEvent: (clipId, nodeId, triggerType) =>
      set((s) => {
        const clip = s.project.clips[clipId];
        const node = clip?.nodes[nodeId];
        if (!node) return;
        let runtime = {
          activeClipId: s.activeClipId,
          playheadMs: s.playheadMs,
          variables: { ...s.runtimeVariables },
          hiddenNodeIds: { ...s.hiddenNodeIds },
          triggeredAudioNodeIds: [] as string[],
        };
        for (const comp of node.components) {
          if (comp.type === 'EventTrigger' && comp.enabled && comp.params.triggerType === triggerType) {
            runtime = executeSafeAction(comp.params, s.project, runtime);
          }
        }
        s.activeClipId = runtime.activeClipId;
        s.playheadMs = runtime.playheadMs;
        s.runtimeVariables = runtime.variables;
        s.hiddenNodeIds = runtime.hiddenNodeIds;
      }),

    resetRuntimeState: () =>
      set((s) => {
        s.runtimeVariables = { ...s.project.initialVariables };
        s.hiddenNodeIds = {};
        s.activeClipId = s.project.metadata.entryClipId;
        s.playheadMs = 0;
      }),

    updateProjectMetadata: (patch) =>
      set((s) => {
        Object.assign(s.project.metadata, patch);
      }),
  })),
);

export function getStoreSnapshot(): StudioState {
  return useStudioStore.getState();
}
