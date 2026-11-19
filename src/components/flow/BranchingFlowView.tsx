import React from 'react';
import { ArrowRight, Play, Plus } from 'lucide-react';
import { formatTimecode, getClipBranchEdges } from '../../engine/sceneMath';
import { useStudioStore } from '../../store/useStudioStore';

export const BranchingFlowView: React.FC = () => {
  const project = useStudioStore((s) => s.project);
  const activeClipId = useStudioStore((s) => s.activeClipId);
  const selectClip = useStudioStore((s) => s.selectClip);
  const setWorkspaceView = useStudioStore((s) => s.setWorkspaceView);
  const setEditorMode = useStudioStore((s) => s.setEditorMode);
  const addClip = useStudioStore((s) => s.addClip);
  const updateProjectMetadata = useStudioStore((s) => s.updateProjectMetadata);

  const edges = getClipBranchEdges(project.clips);

  return (
    <div className="h-full bg-[#080a0f] text-slate-200 flex flex-col overflow-hidden p-2">
      <div className="h-full bg-[#121622] border border-indigo-400/20 rounded-[10px] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[0.06] bg-[#131826] flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-base font-semibold text-slate-100">
              Branching Flow Graph
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Inspect EventTrigger transitions between clips, select the entry scene, or add new branches.
            </p>
          </div>

          <button
            type="button"
            onClick={() => addClip(`Scene ${project.clipOrder.length + 1}`)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-teal-500 hover:bg-teal-400 text-xs font-semibold text-slate-950 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            New Scene
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {project.clipOrder.map((clipId) => {
              const clip = project.clips[clipId];
              if (!clip) return null;
              const isEntry = project.metadata.entryClipId === clip.id;
              const isActive = activeClipId === clip.id;
              const outgoing = edges.filter((e) => e.fromClipId === clip.id);

              return (
                <div
                  key={clip.id}
                  className={`bg-[#0e121d] border rounded-[10px] p-4 flex flex-col justify-between gap-4 ${
                    isActive ? 'border-teal-400/70' : 'border-white/[0.08]'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono text-slate-400">
                        {isEntry ? 'Entry Scene' : 'Branch Scene'} · {clip.id}
                      </span>
                      <span className="text-xs font-mono tabular-nums text-cyan-300">
                        {formatTimecode(clip.durationMs, clip.fps)}
                      </span>
                    </div>

                    <h2 className="font-display text-base font-semibold text-slate-100">
                      {clip.name}
                    </h2>

                    <p className="text-xs text-slate-400 tabular-nums">
                      {Object.keys(clip.nodes).length} layers · {outgoing.length} transitions
                    </p>

                    {outgoing.length > 0 && (
                      <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                        {outgoing.map((edge, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-slate-300 truncate">{edge.label}</span>
                            <span className="inline-flex items-center gap-1 text-cyan-300 font-mono shrink-0">
                              <ArrowRight className="w-3 h-3" />
                              {project.clips[edge.toClipId]?.name.split('—')[0].trim() ?? edge.toClipId}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => {
                        selectClip(clip.id);
                        setWorkspaceView('studio');
                      }}
                      className="flex-1 h-8 rounded-md bg-[#1a2030] hover:bg-[#232c42] text-xs font-medium text-slate-100 cursor-pointer whitespace-nowrap"
                    >
                      Open in Scene
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        selectClip(clip.id);
                        setWorkspaceView('studio');
                        setEditorMode('play');
                      }}
                      className="inline-flex items-center justify-center gap-1 px-3 h-8 rounded-md bg-purple-600/25 hover:bg-purple-600/40 border border-purple-400/50 text-xs font-medium text-purple-200 cursor-pointer whitespace-nowrap"
                    >
                      <Play className="w-3 h-3" />
                      Live Edit
                    </button>

                    {!isEntry && (
                      <button
                        type="button"
                        onClick={() => updateProjectMetadata({ entryClipId: clip.id })}
                        className="px-2.5 h-8 rounded-md bg-[#161b29] hover:bg-[#1e2639] text-xs text-slate-300 cursor-pointer whitespace-nowrap"
                      >
                        Set Entry
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
