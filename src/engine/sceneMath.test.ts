import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canvasPosToAnchorOffset,
  collectUsedAssetIds,
  computeAnchoredRect,
  computeSnapGuides,
  formatTimecode,
  isNodeActiveAtTime,
} from './sceneMath';
import { createComponentInstance, executeSafeAction } from './iscRegistry';
import type { ProjectData, SceneNode } from './types';

test('computeAnchoredRect resolves center, bottom-right, and stretch presets accurately', () => {
  const centerRect = computeAnchoredRect(
    { x: 10, y: -20, width: 200, height: 60, rotation: 0, anchor: 'center' },
    1280,
    720,
  );
  assert.equal(centerRect.x, 1280 / 2 - 100 + 10);
  assert.equal(centerRect.y, 720 / 2 - 30 - 20);

  const brRect = computeAnchoredRect(
    { x: -32, y: -24, width: 240, height: 50, rotation: 0, anchor: 'bottom-right' },
    1280,
    720,
  );
  assert.equal(brRect.x, 1280 - 240 - 32);
  assert.equal(brRect.y, 720 - 50 - 24);

  const stretchRect = computeAnchoredRect(
    { x: 50, y: 50, width: 100, height: 100, rotation: 0, anchor: 'stretch' },
    1280,
    720,
  );
  assert.deepEqual(stretchRect, { x: 0, y: 0, width: 1280, height: 720, rotation: 0 });

  const roundTrip = canvasPosToAnchorOffset(brRect.x, brRect.y, 240, 50, 'bottom-right', 1280, 720);
  assert.deepEqual(roundTrip, { x: -32, y: -24 });
});

test('computeSnapGuides snaps dragged object center to stage center', () => {
  const res = computeSnapGuides(
    { x: 537, y: 300, width: 200, height: 120 }, // center is 637 (within 8px of 640)
    [],
    1280,
    720,
    8,
  );
  assert.equal(res.x, 540);
  assert.equal(res.y, 300);
  assert.equal(res.guides.some((g) => g.axis === 'x' && g.position === 640 && g.kind === 'center'), true);
});

test('isNodeActiveAtTime & formatTimecode behave frame-accurately', () => {
  const node: SceneNode = {
    id: 'n1',
    name: 'Btn',
    parentId: null,
    children: [],
    visible: true,
    locked: false,
    trackKind: 'ui',
    startTime: 2000,
    duration: 3000,
    transform: { x: 0, y: 0, width: 100, height: 40, rotation: 0, anchor: 'center' },
    components: [],
  };
  assert.equal(isNodeActiveAtTime(node, 1999), false);
  assert.equal(isNodeActiveAtTime(node, 2000), true);
  assert.equal(isNodeActiveAtTime(node, 5000), true);
  assert.equal(isNodeActiveAtTime(node, 5001), false);
  assert.equal(formatTimecode(65500, 30), '01:05.15');
});

test('executeSafeAction handles whitelisted actions and rejects unknown scripts', () => {
  const project: ProjectData = {
    metadata: {
      title: 'Test',
      width: 1280,
      height: 720,
      fps: 30,
      entryClipId: 'clip-1',
      authorName: 'Studio',
      authorId: 'u1',
      buildNumber: 1,
    },
    clipOrder: ['clip-1', 'clip-2'],
    clips: {
      'clip-1': { id: 'clip-1', name: 'C1', durationMs: 5000, fps: 30, position: { x: 0, y: 0 }, nodes: {}, rootNodeIds: [] },
      'clip-2': { id: 'clip-2', name: 'C2', durationMs: 4000, fps: 30, position: { x: 100, y: 0 }, nodes: {}, rootNodeIds: [] },
    },
    assets: {
      a1: { id: 'a1', name: 'used.jpg', folder: '/', kind: 'image', mimeType: 'image/jpeg', sizeBytes: 100, url: '/used.jpg' },
      a2: { id: 'a2', name: 'unused.jpg', folder: '/', kind: 'image', mimeType: 'image/jpeg', sizeBytes: 500, url: '/unused.jpg' },
    },
    folders: ['/'],
    initialVariables: {},
  };

  project.clips['clip-1'].nodes['n1'] = {
    id: 'n1',
    name: 'Video',
    parentId: null,
    children: [],
    visible: true,
    locked: false,
    trackKind: 'video',
    startTime: 0,
    duration: 5000,
    transform: { x: 0, y: 0, width: 1280, height: 720, rotation: 0, anchor: 'stretch' },
    components: [createComponentInstance('VideoSource', { assetId: 'a1' })],
  };

  const shaken = collectUsedAssetIds(project);
  assert.deepEqual(shaken.usedIds, ['a1']);
  assert.deepEqual(shaken.unusedIds, ['a2']);

  const s0 = {
    activeClipId: 'clip-1',
    playheadMs: 1200,
    variables: {},
    hiddenNodeIds: {},
    triggeredAudioNodeIds: [],
  };

  const s1 = executeSafeAction({ actionType: 'SetState', stateKey: 'route', stateValue: '42' }, project, s0);
  assert.equal(s1.variables.route, 42);

  const s2 = executeSafeAction({ actionType: 'JumpToClip', targetClipId: 'clip-2', targetTimeMs: 500 }, project, s1);
  assert.equal(s2.activeClipId, 'clip-2');
  assert.equal(s2.playheadMs, 500);

  const sBlocked = executeSafeAction({ actionType: 'EvalArbitraryJS' }, project, s2);
  assert.deepEqual(sBlocked, s2);
});
