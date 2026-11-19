import React, { useState } from 'react';
import {
  Box,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Film,
  Folder,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Unlock,
  Volume2,
} from 'lucide-react';
import { useStudioStore } from '../../store/useStudioStore';
import type { SceneNode } from '../../engine/types';

export const HierarchyPanel: React.FC = () => {
  const project = useStudioStore((s) => s.project);
  const activeClipId = useStudioStore((s) => s.activeClipId);
  const selectedNodeId = useStudioStore((s) => s.selectedNodeId);
  const selectClip = useStudioStore((s) => s.selectClip);
  const addClip = useStudioStore((s) => s.addClip);
  const selectNode = useStudioStore((s) => s.selectNode);
  const createSceneNode = useStudioStore((s) => s.createSceneNode);
  const deleteSceneNode = useStudioStore((s) => s.deleteSceneNode);
  const updateNodeMeta = useStudioStore((s) => s.updateNodeMeta);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [newClipName, setNewClipName] = useState('');
  const [showNewClipInput, setShowNewClipInput] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const activeClip = project.clips[activeClipId];

  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  const getNodeIcon = (node: SceneNode) => {
    if (node.trackKind === 'video') return <Film className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
    if (node.trackKind === 'audio') return <Volume2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
    if (node.trackKind === 'effect') return <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    const hasText = node.components.some((c) => c.type === 'TextRenderer');
    if (hasText) return <Type className="w-3.5 h-3.5 text-slate-300 shrink-0" />;
    return <Box className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
  };

  const renderNodeRow = (nodeId: string, depth: number) => {
    const node = activeClip?.nodes[nodeId];
    if (!node) return null;
    const isSelected = selectedNodeId === node.id;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsedGroups[node.id];

    return (
      <div key={node.id}>
        <div
          className={`group flex items-center justify-between gap-1 h-7 pr-1.5 rounded-md mx-1 transition-colors ${
            isSelected
              ? 'bg-teal-500/15 text-white ring-1 ring-teal-400/35'
              : 'text-slate-300 hover:bg-white/[0.04]'
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                aria-label={`Toggle ${node.name}`}
                onClick={() => toggleGroup(node.id)}
                className="p-0.5 text-slate-500 hover:text-white cursor-pointer"
              >
                {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            ) : (
              <span className="w-3 shrink-0" />
            )}

            {getNodeIcon(node)}

            <button
              type="button"
              onClick={() => selectNode(node.id)}
              className="text-left text-[12px] font-medium truncate flex-1 cursor-pointer py-0.5"
            >
              {node.name}
            </button>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              aria-label={`Toggle ${node.name} visibility`}
              onClick={() => updateNodeMeta(activeClipId, node.id, { visible: !node.visible })}
              className={`p-1 rounded hover:bg-white/[0.08] cursor-pointer transition-opacity ${
                node.visible
                  ? 'text-slate-400 hover:text-slate-100 opacity-0 group-hover:opacity-100 focus:opacity-100'
                  : 'text-slate-500 opacity-90'
              }`}
            >
              {node.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            </button>

            <button
              type="button"
              aria-label={`Toggle ${node.name} lock`}
              onClick={() => updateNodeMeta(activeClipId, node.id, { locked: !node.locked })}
              className={`p-1 rounded hover:bg-white/[0.08] cursor-pointer transition-opacity ${
                node.locked
                  ? 'text-amber-400 opacity-95'
                  : 'text-slate-400 hover:text-slate-200 opacity-0 group-hover:opacity-100 focus:opacity-100'
              }`}
            >
              {node.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>

            <button
              type="button"
              aria-label={`Delete ${node.name}`}
              onClick={() => deleteSceneNode(activeClipId, node.id)}
              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-white/[0.08] cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {hasChildren && !isCollapsed && node.children.map((cid) => renderNodeRow(cid, depth + 1))}
      </div>
    );
  };

  const allRootNodes = (activeClip?.rootNodeIds ?? [])
    .map((id) => activeClip?.nodes[id])
    .filter((n): n is SceneNode => Boolean(n));

  const trackNodes = allRootNodes.filter((n) => n.trackKind !== 'ui');
  const layerNodes = allRootNodes.filter((n) => n.trackKind === 'ui');

  return (
    <div className="h-full flex flex-col bg-[#121622] text-slate-200 select-none">
      {/* Compact Scene Clip Switcher & Add Layer */}
      <div className="px-2.5 py-2 border-b border-white/[0.05] space-y-1.5 relative">
        <div className="flex items-center gap-1.5">
          <select
            id="hierarchy-clip-select"
            aria-label="Active Scene Clip"
            value={activeClipId}
            onChange={(e) => selectClip(e.target.value)}
            className="flex-1 min-w-0 h-7 px-2 text-xs font-medium bg-[#0b0e17] border border-white/[0.08] rounded-md text-slate-100 focus:outline-none focus:border-teal-400/70"
          >
            {project.clipOrder.map((cid) => {
              const clip = project.clips[cid];
              return (
                <option key={cid} value={cid}>
                  {clip?.name ?? cid}
                </option>
              );
            })}
          </select>

          <button
            type="button"
            aria-label="New Scene"
            title="New Scene"
            onClick={() => setShowNewClipInput((v) => !v)}
            className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md bg-[#0b0e17] hover:bg-white/[0.06] border border-white/[0.08] text-slate-300 hover:text-white cursor-pointer transition-colors"
          >
            <Folder className="w-3.5 h-3.5 text-teal-400" />
          </button>

          <button
            type="button"
            aria-label="Add Layer"
            title="Add Layer"
            onClick={() => setAddMenuOpen((v) => !v)}
            className="h-7 px-2 shrink-0 inline-flex items-center gap-1 rounded-md bg-[#0b0e17] hover:bg-white/[0.06] border border-white/[0.08] text-[11px] font-medium text-slate-200 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-teal-400" />
            <span>Add</span>
          </button>
        </div>

        {showNewClipInput && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newClipName.trim()) return;
              addClip(newClipName.trim());
              setNewClipName('');
              setShowNewClipInput(false);
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              value={newClipName}
              onChange={(e) => setNewClipName(e.target.value)}
              placeholder="Scene name..."
              aria-label="New scene name"
              className="flex-1 min-w-0 h-7 px-2 text-xs bg-[#0b0e17] border border-white/[0.08] rounded-md text-slate-100 focus:outline-none focus:border-teal-400/70"
            />
            <button
              type="submit"
              className="px-2.5 h-7 rounded-md bg-teal-500 hover:bg-teal-400 text-xs font-semibold text-slate-950 cursor-pointer whitespace-nowrap"
            >
              Add
            </button>
          </form>
        )}

        {addMenuOpen && (
          <div className="absolute right-2.5 top-10 z-30 w-44 bg-[#161b2a] border border-white/[0.12] rounded-lg shadow-2xl py-1">
            {[
              { kind: 'video' as const, label: 'Video / Image Layer' },
              { kind: 'ui' as const, label: 'Interactive Button' },
              { kind: 'text' as const, label: 'Text / Subtitle' },
              { kind: 'audio' as const, label: 'Audio Emitter' },
              { kind: 'effect' as const, label: 'Material Effect' },
            ].map((item) => (
              <button
                key={item.kind}
                type="button"
                onClick={() => {
                  createSceneNode(item.kind);
                  setAddMenuOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-teal-500/15 hover:text-white cursor-pointer"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Reference-style Folder & Node Hierarchy Tree */}
      <div className="flex-1 overflow-y-auto py-1.5 space-y-0.5">
        {activeClip && allRootNodes.length > 0 ? (
          <>
            {/* Root Scene Row */}
            <button
              type="button"
              onClick={() => toggleGroup('root-scene')}
              className="w-[calc(100%-8px)] mx-1 px-2 h-7 rounded-md bg-white/[0.06] flex items-center gap-1.5 text-left text-xs font-medium text-slate-100 cursor-pointer"
            >
              {collapsedGroups['root-scene'] ? (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <Folder className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              <span className="truncate">Scene</span>
            </button>

            {!collapsedGroups['root-scene'] && (
              <div className="space-y-0.5 pt-0.5">
                {/* Scene Tracks Folder */}
                <button
                  type="button"
                  onClick={() => toggleGroup('grp-tracks')}
                  className="w-[calc(100%-8px)] mx-1 pl-5 pr-2 h-7 rounded-md hover:bg-white/[0.03] flex items-center gap-1.5 text-left text-xs text-slate-300 cursor-pointer"
                >
                  {collapsedGroups['grp-tracks'] ? (
                    <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
                  )}
                  <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">Scene Tracks</span>
                </button>
                {!collapsedGroups['grp-tracks'] && trackNodes.map((n) => renderNodeRow(n.id, 2))}

                {/* Layer Assets Folder */}
                <button
                  type="button"
                  onClick={() => toggleGroup('grp-layers')}
                  className="w-[calc(100%-8px)] mx-1 pl-5 pr-2 h-7 rounded-md hover:bg-white/[0.03] flex items-center gap-1.5 text-left text-xs text-slate-300 cursor-pointer"
                >
                  {collapsedGroups['grp-layers'] ? (
                    <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
                  )}
                  <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">Layer Assets</span>
                </button>
                {!collapsedGroups['grp-layers'] && layerNodes.map((n) => renderNodeRow(n.id, 2))}

                {/* Scene Assets (Clips quick jump) */}
                <button
                  type="button"
                  onClick={() => toggleGroup('grp-scenes')}
                  className="w-[calc(100%-8px)] mx-1 pl-5 pr-2 h-7 rounded-md hover:bg-white/[0.03] flex items-center gap-1.5 text-left text-xs text-slate-300 cursor-pointer"
                >
                  {collapsedGroups['grp-scenes'] ? (
                    <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
                  )}
                  <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">Scene Assets</span>
                </button>
                {!collapsedGroups['grp-scenes'] &&
                  project.clipOrder.map((cid) => {
                    const clip = project.clips[cid];
                    if (!clip) return null;
                    const isCurrent = cid === activeClipId;
                    return (
                      <button
                        key={cid}
                        type="button"
                        onClick={() => selectClip(cid)}
                        className={`w-[calc(100%-8px)] mx-1 pl-10 pr-2 h-7 rounded-md flex items-center gap-1.5 text-left text-xs cursor-pointer transition-colors ${
                          isCurrent ? 'text-teal-300 bg-teal-500/10' : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
                        }`}
                      >
                        <Box className="w-3 h-3 shrink-0 opacity-75" />
                        <span className="truncate">{clip.name}</span>
                      </button>
                    );
                  })}
              </div>
            )}
          </>
        ) : (
          <div className="p-5 text-center space-y-2">
            <p className="text-xs text-slate-500">No layers in this scene yet.</p>
            <button
              type="button"
              onClick={() => createSceneNode('ui')}
              className="px-3 py-1.5 rounded-md bg-teal-500 hover:bg-teal-400 text-xs font-semibold text-slate-950 cursor-pointer"
            >
              Add First Layer
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
