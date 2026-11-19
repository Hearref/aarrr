import { useCallback, useRef, useState } from 'react';
import type { DockviewApi } from 'dockview';
import {
  DockWorkspace,
  resetDockviewLayout,
} from './components/DockWorkspace';
import { LeftIconRail } from './components/LeftIconRail';
import { BranchingFlowView } from './components/flow/BranchingFlowView';
import { BuildIntModal } from './components/modals/BuildIntModal';
import { IntPlayerView } from './components/player/IntPlayerView';
import { useStudioStore } from './store/useStudioStore';

export default function App() {
  const workspaceView = useStudioStore((s) => s.workspaceView);
  const dockApiRef = useRef<DockviewApi | null>(null);
  const [layoutNotice, setLayoutNotice] = useState<string | null>(null);

  const handleApiReady = useCallback((api: DockviewApi) => {
    dockApiRef.current = api;
  }, []);

  const handleResetLayout = () => {
    resetDockviewLayout(dockApiRef.current);
    setLayoutNotice('Layout Reset');
    window.setTimeout(() => setLayoutNotice(null), 1800);
  };

  return (
    <div className="h-screen w-screen flex flex-row bg-[#080a0f] text-[#e2e8f0] overflow-hidden">
      <LeftIconRail
        onResetLayout={handleResetLayout}
        layoutNotice={layoutNotice}
      />

      <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        {workspaceView === 'studio' && <DockWorkspace onApiReady={handleApiReady} />}
        {workspaceView === 'flow' && <BranchingFlowView />}
        {workspaceView === 'player' && <IntPlayerView />}
      </main>

      <BuildIntModal />
    </div>
  );
}
