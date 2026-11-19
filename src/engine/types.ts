export type AnchorPreset =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'stretch';

export interface RectTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  anchor: AnchorPreset;
}

export type IscComponentType =
  | 'VideoSource'
  | 'AudioEmitter'
  | 'InteractiveButton'
  | 'TextRenderer'
  | 'MaterialEffect'
  | 'EventTrigger';

export type IscFieldType =
  | 'string'
  | 'textarea'
  | 'number'
  | 'range'
  | 'color'
  | 'boolean'
  | 'select'
  | 'asset'
  | 'clipRef'
  | 'nodeRef';

export interface IscSchemaField {
  key: string;
  label: string;
  type: IscFieldType;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  assetKinds?: ('video' | 'image' | 'audio')[];
  group?: string;
}

export interface IscComponentSchema {
  type: IscComponentType;
  label: string;
  description: string;
  defaultParams: Record<string, unknown>;
  fields: IscSchemaField[];
}

export interface IscComponentInstance {
  id: string;
  type: IscComponentType;
  enabled: boolean;
  params: Record<string, unknown>;
}

export type TrackKind = 'video' | 'ui' | 'audio' | 'effect';

export interface SceneNode {
  id: string;
  name: string;
  parentId: string | null;
  children: string[];
  visible: boolean;
  locked: boolean;
  trackKind: TrackKind;
  startTime: number; // ms
  duration: number; // ms
  transform: RectTransform;
  components: IscComponentInstance[];
}

export interface ClipSequence {
  id: string;
  name: string;
  durationMs: number;
  fps: number;
  position: { x: number; y: number }; // For branching flow graph
  nodes: Record<string, SceneNode>;
  rootNodeIds: string[];
}

export type AssetKind = 'video' | 'image' | 'audio';

export interface AssetItem {
  id: string;
  name: string;
  folder: string;
  kind: AssetKind;
  mimeType: string;
  sizeBytes: number;
  url: string; // Object URL or bundled asset path
  opfsPath?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  fps?: number;
  waveform?: number[]; // 0..1 normalized peaks
}

export type RuntimeVariableValue = string | number | boolean;

export type EditorMode = 'edit' | 'play';
export type ProxyScale = 1 | 0.5 | 0.25;
export type WorkspaceView = 'studio' | 'flow' | 'player';

export interface ProjectMetadata {
  title: string;
  width: number;
  height: number;
  fps: number;
  entryClipId: string;
  authorName: string;
  authorId: string;
  buildNumber: number;
}

export interface ProjectData {
  metadata: ProjectMetadata;
  clips: Record<string, ClipSequence>;
  clipOrder: string[];
  assets: Record<string, AssetItem>;
  folders: string[];
  initialVariables: Record<string, RuntimeVariableValue>;
}

export interface IntManifest {
  format: 'KinoForge.INT';
  version: string;
  title: string;
  entryClipId: string;
  resolution: { width: number; height: number };
  fps: number;
  usedComponents: IscComponentType[];
  assetEntries: Record<string, string>; // assetId -> archive relative path
  createdAtUtc: string;
  buildNumber: number;
}

export interface IntSignatureBlock {
  algorithm: 'ECDSA-P256-SHA256';
  producer: {
    userId: string;
    studioName: string;
    publicKeyFingerprint: string;
  };
  timestampUtc: string;
  buildNumber: number;
  publicKeyJwk: JsonWebKey;
  fileHashes: Record<string, string>; // archive path -> sha256 hex
  signatureBase64: string;
}

export interface CentralDirectoryEntry {
  fileName: string;
  compressionMethod: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  dataOffset: number;
}

export interface IntVerificationResult {
  valid: boolean;
  tamperedFiles: string[];
  missingFiles: string[];
  signatureValid: boolean;
  reason?: string;
  manifest?: IntManifest;
  signatureBlock?: IntSignatureBlock;
  entries: CentralDirectoryEntry[];
}
