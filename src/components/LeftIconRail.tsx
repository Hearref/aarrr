import React from 'react';
import {
  Box,
  FileText,
  Folder,
  GitBranch,
  Layers,
  RotateCcw,
} from 'lucide-react';
import { useStudioStore } from '../store/useStudioStore';

interface LeftIconRailProps {
  onResetLayout: () => void;
  layoutNotice: string | null;
}

export const LeftIconRail: React.FC<LeftIconRailProps> = ({
  onResetLayout,
  layoutNotice,
}) => {
  const workspaceView = useStudioStore((s) => s.workspaceView);
  const setWorkspaceView = useStudioStore((s) => s.setWorkspaceView);
  const setBuildModalOpen = useStudioStore((s) => s.setBuildModalOpen);
  const setActiveFolder = useStudioStore((s) => s.setActiveFolder);

  const railItemClass = (active: boolean) =>
    `w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-400 ${
      active
        ? 'bg-teal-500/20 border border-teal-400/50 text-teal-300 shadow-[0_0_12px_rgba(20,184,166,0.2)]'
        : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] border border-transparent'
    }`;

  return (
    <aside
      aria-label="Workspace Navigation"
      className="w-12 shrink-0 bg-[#0b0e17] border-r border-white/[0.06] flex flex-col items-center justify-between py-3 select-none z-20"
    >
      <div className="flex flex-col items-center gap-2.5">
        {/* 1. Studio Workspace */}
        <button
          type="button"
          title="Studio Editor"
          aria-label="Studio Editor"
          aria-pressed={workspaceView === 'studio'}
          onClick={() => setWorkspaceView('studio')}
          className={railItemClass(workspaceView === 'studio')}
        >
          <FileText className="w-4 h-4" />
        </button>

        {/* 2. Branching Flow Graph */}
        <button
          type="button"
          title="Branching Flow Graph"
          aria-label="Branching Flow Graph"
          aria-pressed={workspaceView === 'flow'}
          onClick={() => setWorkspaceView('flow')}
          className={railItemClass(workspaceView === 'flow')}
        >
          <GitBranch className="w-4 h-4" />
        </button>

        {/* 3. File System Root */}
        <button
          type="button"
          title="File System (All Media)"
          aria-label="File System"
          onClick={() => {
            setWorkspaceView('studio');
            setActiveFolder('/');
          }}
          className={railItemClass(false)}
        >
          <Folder className="w-4 h-4" />
        </button>

        {/* 4. .int Package Player & Verifier */}
        <button
          type="button"
          title=".int Player & Verifier"
          aria-label=".int Player & Verifier"
          aria-pressed={workspaceView === 'player'}
          onClick={() => setWorkspaceView('player')}
          className={railItemClass(workspaceView === 'player')}
        >
          <Box className="w-4 h-4" />
        </button>

        {/* 5. Build .int Package */}
        <button
          type="button"
          title="Build .int Package"
          aria-label="Build .int Package"
          onClick={() => setBuildModalOpen(true)}
          className={railItemClass(false)}
        >
          <Layers className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          title={layoutNotice ?? 'Reset Panel Layout'}
          aria-label="Reset Panel Layout"
          onClick={onResetLayout}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
