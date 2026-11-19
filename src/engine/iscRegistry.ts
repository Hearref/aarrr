import type {
  IscComponentInstance,
  IscComponentSchema,
  IscComponentType,
  ProjectData,
  RuntimeVariableValue,
} from './types';

export const ISC_REGISTRY: Record<IscComponentType, IscComponentSchema> = {
  VideoSource: {
    type: 'VideoSource',
    label: 'Video Source',
    description: 'Binds a video or high-resolution still frame to the scene layer and controls trim bounds.',
    defaultParams: {
      assetId: '',
      trimInMs: 0,
      trimOutMs: 8000,
      volume: 1,
      playbackRate: 1,
      loop: true,
      opacity: 1,
      objectFit: 'cover',
    },
    fields: [
      { key: 'assetId', label: 'Media Asset', type: 'asset', assetKinds: ['video', 'image'] },
      { key: 'trimInMs', label: 'Trim In (ms)', type: 'number', min: 0, step: 100 },
      { key: 'trimOutMs', label: 'Trim Out (ms)', type: 'number', min: 100, step: 100 },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'volume', label: 'Volume', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'playbackRate', label: 'Speed', type: 'range', min: 0.25, max: 2, step: 0.05 },
      {
        key: 'objectFit',
        label: 'Fit Mode',
        type: 'select',
        options: [
          { value: 'cover', label: 'Cover' },
          { value: 'contain', label: 'Contain' },
          { value: 'fill', label: 'Fill' },
        ],
      },
      { key: 'loop', label: 'Loop', type: 'boolean' },
    ],
  },

  AudioEmitter: {
    type: 'AudioEmitter',
    label: 'Audio Emitter',
    description: 'Provides sample-accurate Web Audio mixing, stereo panning, and procedural ambience.',
    defaultParams: {
      assetId: '',
      volume: 0.75,
      pan: 0,
      fadeInMs: 400,
      fadeOutMs: 400,
      loop: false,
      synthMood: 'noir-drone',
    },
    fields: [
      { key: 'assetId', label: 'Audio File', type: 'asset', assetKinds: ['audio'] },
      { key: 'volume', label: 'Volume', type: 'range', min: 0, max: 1, step: 0.02 },
      { key: 'pan', label: 'Stereo Pan', type: 'range', min: -1, max: 1, step: 0.05 },
      { key: 'fadeInMs', label: 'Fade In (ms)', type: 'number', min: 0, max: 5000, step: 50 },
      { key: 'fadeOutMs', label: 'Fade Out (ms)', type: 'number', min: 0, max: 5000, step: 50 },
      {
        key: 'synthMood',
        label: 'Synth Mood',
        type: 'select',
        options: [
          { value: 'noir-drone', label: 'Noir Atmospheric Drone' },
          { value: 'station-chime', label: 'Station Announcement' },
          { value: 'control-hum', label: 'Control Room Oscillator' },
          { value: 'dawn-pad', label: 'Dawn Harmonic Pad' },
        ],
      },
      { key: 'loop', label: 'Loop', type: 'boolean' },
    ],
  },

  InteractiveButton: {
    type: 'InteractiveButton',
    label: 'Interactive Button',
    description: 'Renders crisp interactive choice buttons in the synchronized DOM overlay.',
    defaultParams: {
      label: 'Confirm Choice',
      subtitle: '',
      bgColor: '#161d29',
      textColor: '#f8fafc',
      borderColor: '#3b82f6',
      borderRadius: 8,
      fontSize: 15,
      hoverScale: 1.03,
    },
    fields: [
      { key: 'label', label: 'Label', type: 'string' },
      { key: 'subtitle', label: 'Subtitle', type: 'string' },
      { key: 'bgColor', label: 'Fill Color', type: 'color' },
      { key: 'textColor', label: 'Text Color', type: 'color' },
      { key: 'borderColor', label: 'Border Color', type: 'color' },
      { key: 'borderRadius', label: 'Radius', type: 'range', min: 0, max: 24, step: 1 },
      { key: 'fontSize', label: 'Font Size', type: 'range', min: 12, max: 28, step: 1 },
      { key: 'hoverScale', label: 'Hover Scale', type: 'range', min: 1, max: 1.15, step: 0.01 },
    ],
  },

  TextRenderer: {
    type: 'TextRenderer',
    label: 'Font & Text',
    description: 'Draws crisp scene titles, dialogue, or timed subtitles on the DOM overlay.',
    defaultParams: {
      text: 'Scene Text',
      fontSize: 22,
      color: '#f1f5f9',
      align: 'left',
      backgroundScrim: true,
      fontWeight: '600',
    },
    fields: [
      { key: 'text', label: 'Content', type: 'textarea' },
      { key: 'fontSize', label: 'Font Size', type: 'range', min: 12, max: 64, step: 1 },
      { key: 'color', label: 'Color', type: 'color' },
      {
        key: 'align',
        label: 'Align',
        type: 'select',
        options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
        ],
      },
      {
        key: 'fontWeight',
        label: 'Weight',
        type: 'select',
        options: [
          { value: '400', label: 'Regular (400)' },
          { value: '600', label: 'SemiBold (600)' },
          { value: '700', label: 'Bold (700)' },
        ],
      },
      { key: 'backgroundScrim', label: 'Scrim', type: 'boolean' },
    ],
  },

  MaterialEffect: {
    type: 'MaterialEffect',
    label: 'Material',
    description: 'Controls brightness, contrast, vignette, tint, and film grain on the viewport canvas.',
    defaultParams: {
      brightness: 1,
      contrast: 1.06,
      saturation: 0.92,
      blur: 0,
      vignette: 0.35,
      tintColor: '#0f172a',
      tintOpacity: 0.12,
      filmGrain: 0.1,
    },
    fields: [
      { key: 'brightness', label: 'Brightness', type: 'range', min: 0.4, max: 1.8, step: 0.02 },
      { key: 'contrast', label: 'Contrast', type: 'range', min: 0.5, max: 2, step: 0.02 },
      { key: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 2, step: 0.02 },
      { key: 'blur', label: 'Blur (px)', type: 'range', min: 0, max: 12, step: 0.5 },
      { key: 'vignette', label: 'Vignette', type: 'range', min: 0, max: 0.9, step: 0.05 },
      { key: 'tintColor', label: 'Visual Tint', type: 'color' },
      { key: 'tintOpacity', label: 'Tint Alpha', type: 'range', min: 0, max: 0.7, step: 0.02 },
      { key: 'filmGrain', label: 'Film Grain', type: 'range', min: 0, max: 0.5, step: 0.02 },
    ],
  },

  EventTrigger: {
    type: 'EventTrigger',
    label: 'Event',
    description: 'Binds whitelisted safe branching actions (JumpToClip, SeekToTime, ToggleNode, SetState).',
    defaultParams: {
      triggerType: 'OnClick',
      triggerTimeMs: 0,
      actionType: 'JumpToClip',
      targetClipId: '',
      targetTimeMs: 0,
      targetNodeId: '',
      stateKey: 'decision',
      stateValue: 'confirmed',
    },
    fields: [
      {
        key: 'triggerType',
        label: 'Triggers',
        type: 'select',
        options: [
          { value: 'OnClick', label: 'OnClick' },
          { value: 'OnTimeReach', label: 'OnTimeReach' },
          { value: 'OnHover', label: 'OnHover' },
        ],
      },
      { key: 'triggerTimeMs', label: 'Time (ms)', type: 'number', min: 0, step: 100 },
      {
        key: 'actionType',
        label: 'Action',
        type: 'select',
        options: [
          { value: 'JumpToClip', label: 'JumpToClip' },
          { value: 'SeekToTime', label: 'SeekToTime' },
          { value: 'ToggleNode', label: 'ToggleNode' },
          { value: 'SetState', label: 'SetState' },
          { value: 'PlayAudio', label: 'PlayAudio' },
        ],
      },
      { key: 'targetClipId', label: 'Target Clip', type: 'clipRef' },
      { key: 'targetTimeMs', label: 'Seek (ms)', type: 'number', min: 0, step: 100 },
      { key: 'targetNodeId', label: 'Target Node', type: 'nodeRef' },
      { key: 'stateKey', label: 'State Key', type: 'string' },
      { key: 'stateValue', label: 'State Value', type: 'string' },
    ],
  },
};

export function createComponentInstance(
  type: IscComponentType,
  overrides: Record<string, unknown> = {},
  id?: string,
): IscComponentInstance {
  const schema = ISC_REGISTRY[type];
  return {
    id: id ?? `comp-${type.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    enabled: true,
    params: {
      ...schema.defaultParams,
      ...overrides,
    },
  };
}

export interface SafeRuntimeState {
  activeClipId: string;
  playheadMs: number;
  variables: Record<string, RuntimeVariableValue>;
  hiddenNodeIds: Record<string, boolean>;
  triggeredAudioNodeIds: string[];
}

const WHITELISTED_ACTIONS = new Set([
  'JumpToClip',
  'SeekToTime',
  'ToggleNode',
  'SetState',
  'PlayAudio',
]);

/**
 * Sandboxed, strictly whitelisted action executor.
 * Rejects any arbitrary code or unknown action names (CSP & sandboxing guarantee).
 */
export function executeSafeAction(
  params: Record<string, unknown>,
  project: ProjectData,
  state: SafeRuntimeState,
): SafeRuntimeState {
  const actionType = String(params.actionType ?? '');
  if (!WHITELISTED_ACTIONS.has(actionType)) {
    return state;
  }

  switch (actionType) {
    case 'JumpToClip': {
      const targetClipId = String(params.targetClipId ?? '');
      if (!targetClipId || !project.clips[targetClipId]) {
        return state;
      }
      const targetTimeMs = Math.max(0, Number(params.targetTimeMs ?? 0) || 0);
      return {
        ...state,
        activeClipId: targetClipId,
        playheadMs: Math.min(targetTimeMs, project.clips[targetClipId].durationMs),
      };
    }

    case 'SeekToTime': {
      const clip = project.clips[state.activeClipId];
      const maxMs = clip ? clip.durationMs : 0;
      const targetTimeMs = Math.max(0, Math.min(maxMs, Number(params.targetTimeMs ?? 0) || 0));
      return {
        ...state,
        playheadMs: targetTimeMs,
      };
    }

    case 'ToggleNode': {
      const targetNodeId = String(params.targetNodeId ?? '');
      if (!targetNodeId) return state;
      const nextHidden = { ...state.hiddenNodeIds };
      nextHidden[targetNodeId] = !nextHidden[targetNodeId];
      return {
        ...state,
        hiddenNodeIds: nextHidden,
      };
    }

    case 'SetState': {
      const key = String(params.stateKey ?? '').trim();
      if (!key || key.length > 64) return state;
      const rawVal = params.stateValue;
      let parsedVal: RuntimeVariableValue = String(rawVal ?? '');
      if (rawVal === 'true') parsedVal = true;
      else if (rawVal === 'false') parsedVal = false;
      else if (typeof rawVal === 'string' && rawVal.trim() !== '' && !Number.isNaN(Number(rawVal))) {
        parsedVal = Number(rawVal);
      }
      return {
        ...state,
        variables: {
          ...state.variables,
          [key]: parsedVal,
        },
      };
    }

    case 'PlayAudio': {
      const targetNodeId = String(params.targetNodeId ?? '');
      if (!targetNodeId) return state;
      return {
        ...state,
        triggeredAudioNodeIds: [...state.triggeredAudioNodeIds, targetNodeId],
      };
    }

    default:
      return state;
  }
}
