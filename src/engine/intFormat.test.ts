import test from 'node:test';
import assert from 'node:assert/strict';
import { strToU8 } from 'fflate';
import {
  buildIntContainer,
  parseZipCentralDirectory,
  readProjectFromIntBlob,
  readZipEntrySlice,
  verifyIntBlob,
} from './intFormat';
import { createComponentInstance } from './iscRegistry';
import type { ProjectData } from './types';

function makeSampleProject(): ProjectData {
  return {
    metadata: {
      title: 'Test Interactive Film',
      width: 1280,
      height: 720,
      fps: 30,
      entryClipId: 'clip-1',
      authorName: 'KinoTest Studio',
      authorId: 'usr-01',
      buildNumber: 7,
    },
    clipOrder: ['clip-1'],
    clips: {
      'clip-1': {
        id: 'clip-1',
        name: 'Opening',
        durationMs: 5000,
        fps: 30,
        position: { x: 0, y: 0 },
        rootNodeIds: ['node-vid'],
        nodes: {
          'node-vid': {
            id: 'node-vid',
            name: 'Bg Still',
            parentId: null,
            children: [],
            visible: true,
            locked: false,
            trackKind: 'video',
            startTime: 0,
            duration: 5000,
            transform: { x: 0, y: 0, width: 1280, height: 720, rotation: 0, anchor: 'stretch' },
            components: [createComponentInstance('VideoSource', { assetId: 'asset-used' })],
          },
        },
      },
    },
    assets: {
      'asset-used': {
        id: 'asset-used',
        name: 'frame.bin',
        folder: '/Medya',
        kind: 'image',
        mimeType: 'application/octet-stream',
        sizeBytes: 16,
        url: '/frame.bin',
      },
      'asset-unused': {
        id: 'asset-unused',
        name: 'cut_outtake.bin',
        folder: '/Medya',
        kind: 'video',
        mimeType: 'video/mp4',
        sizeBytes: 4096,
        url: '/cut_outtake.bin',
      },
    },
    folders: ['/Medya'],
    initialVariables: { visited: true },
  };
}

test('buildIntContainer creates STORE-mode archive, tree-shakes unused assets, and passes ECDSA + SHA-256 verification', async () => {
  const project = makeSampleProject();
  const built = await buildIntContainer(project, {
    producerName: 'KinoTest Studio',
    producerId: 'usr-01',
    buildNumber: 7,
    assetPayloads: {
      'asset-used': {
        assetId: 'asset-used',
        fileName: 'frame.bin',
        bytes: strToU8('HELLO_KINO_FRAME'),
      },
      'asset-unused': {
        assetId: 'asset-unused',
        fileName: 'cut_outtake.bin',
        bytes: new Uint8Array(4096),
      },
    },
  });

  assert.deepEqual(built.treeShakenUnusedIds, ['asset-unused']);
  assert.equal(built.savedBytesEstimate, 4096);

  const entries = await parseZipCentralDirectory(built.blob);
  assert.equal(entries.every((e) => e.compressionMethod === 0), true);
  assert.equal(entries.some((e) => e.fileName.includes('asset-unused')), false);
  assert.equal(entries.some((e) => e.fileName === 'SIGNATURE.sig'), true);

  const assetEntry = entries.find((e) => e.fileName.startsWith('assets/asset-used_'));
  assert.ok(assetEntry);
  const sliced = await readZipEntrySlice(built.blob, assetEntry);
  assert.equal(new TextDecoder().decode(sliced), 'HELLO_KINO_FRAME');

  const verification = await verifyIntBlob(built.blob);
  assert.equal(verification.valid, true);
  assert.equal(verification.signatureValid, true);
  assert.deepEqual(verification.tamperedFiles, []);
  assert.equal(verification.manifest?.title, 'Test Interactive Film');

  const loaded = await readProjectFromIntBlob(built.blob, verification.entries);
  assert.equal(loaded.project.metadata.title, 'Test Interactive Film');
});

test('verifyIntBlob detects 1-byte tampering inside STORE-mode .int archive', async () => {
  const project = makeSampleProject();
  const built = await buildIntContainer(project, {
    producerName: 'KinoTest Studio',
    producerId: 'usr-01',
    buildNumber: 8,
    assetPayloads: {
      'asset-used': {
        assetId: 'asset-used',
        fileName: 'frame.bin',
        bytes: strToU8('UNTOUCHED_PAYLOAD_DATA'),
      },
    },
  });

  const entries = await parseZipCentralDirectory(built.blob);
  const target = entries.find((e) => e.fileName.startsWith('assets/asset-used_'));
  assert.ok(target);

  // Flip 1 byte directly inside the stored asset's dataOffset
  const tamperedBytes = new Uint8Array(built.bytes);
  tamperedBytes[target.dataOffset] = tamperedBytes[target.dataOffset] ^ 0xff;
  const tamperedBlob = new Blob([tamperedBytes]);

  const verification = await verifyIntBlob(tamperedBlob);
  assert.equal(verification.valid, false);
  assert.equal(verification.signatureValid, true);
  assert.deepEqual(verification.tamperedFiles, [target.fileName]);
});
