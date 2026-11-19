import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createDockview,
  themeAbyss,
  type DockviewApi,
  type IContentRenderer,
} from 'dockview';
import { HierarchyPanel } from './panels/HierarchyPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { ProjectBrowserPanel } from './panels/ProjectBrowserPanel';
import { SceneViewportPanel } from './panels/SceneViewportPanel';
import { TimelinePanel } from './panels/TimelinePanel';

const LAYOUT_STORAGE_KEY = 'kinoforge.dockview.layout.v3';

interface PortalTarget {
  id: string;
  component: string;
  element: HTMLElement;
}

function renderPanelByName(name: string): React.ReactNode {
  switch (name) {
    case 'hierarchy':
      return <HierarchyPanel />;
    case 'scene':
      return <SceneViewportPanel />;
    case 'inspector':
      return <InspectorPanel />;
    case 'timeline':
      return <TimelinePanel />;
    case 'project':
      return <ProjectBrowserPanel />;
    default:
      return null;
  }
}

export function createDefaultLayout(api: DockviewApi) {
  const scenePanel = api.addPanel({
    id: 'panel-scene',
    component: 'scene',
    title: 'Scene',
  });

  // Left Column Top: Hierarchy
  const hierarchyPanel = api.addPanel({
    id: 'panel-hierarchy',
    component: 'hierarchy',
    title: 'Hierarchy',
    position: { referencePanel: scenePanel, direction: 'left' },
    initialWidth: 255,
  });

  // Left Column Bottom: File System (simultaneously visible below Hierarchy)
  const fileSystemPanel = api.addPanel({
    id: 'panel-project',
    component: 'project',
    title: 'File System',
    position: { referencePanel: hierarchyPanel, direction: 'below' },
    initialHeight: 295,
  });

  // Right Column Full-Height: Inspector
  const inspectorPanel = api.addPanel({
    id: 'panel-inspector',
    component: 'inspector',
    title: 'Inspector',
    position: { referencePanel: scenePanel, direction: 'right' },
    initialWidth: 270,
  });

  // Center Column Bottom: Time Line below Scene
  const timelinePanel = api.addPanel({
    id: 'panel-timeline',
    component: 'timeline',
    title: 'Time Line',
    position: { referencePanel: scenePanel, direction: 'below' },
    initialHeight: 235,
  });

  hierarchyPanel.api.setSize({ width: 255 });
  inspectorPanel.api.setSize({ width: 270 });
  fileSystemPanel.api.setSize({ height: 295 });
  timelinePanel.api.setSize({ height: 235 });
}

interface DockWorkspaceProps {
  onApiReady: (api: DockviewApi) => void;
}

export const DockWorkspace: React.FC<DockWorkspaceProps> = ({ onApiReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [portals, setPortals] = useState<PortalTarget[]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const api = createDockview(el, {
      theme: themeAbyss,
      createComponent: (options): IContentRenderer => {
        const panelEl = document.createElement('div');
        panelEl.style.width = '100%';
        panelEl.style.height = '100%';
        panelEl.style.overflow = 'hidden';

        return {
          element: panelEl,
          init: () => {
            setPortals((prev) => {
              const filtered = prev.filter((p) => p.id !== options.id);
              return [...filtered, { id: options.id, component: options.name, element: panelEl }];
            });
          },
          dispose: () => {
            setPortals((prev) => prev.filter((p) => p.id !== options.id));
          },
        };
      },
    });

    onApiReady(api);

    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    let restored = false;
    if (saved) {
      try {
        api.fromJSON(JSON.parse(saved));
        restored = true;
      } catch {
        localStorage.removeItem(LAYOUT_STORAGE_KEY);
      }
    }
    if (!restored) {
      createDefaultLayout(api);
    }

    const layoutListener = api.onDidLayoutChange(() => {
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(api.toJSON()));
      } catch {
        // Ignore storage errors
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        api.layout(el.clientWidth, el.clientHeight);
      }
    });
    resizeObserver.observe(el);

    return () => {
      layoutListener.dispose();
      resizeObserver.disconnect();
      setPortals([]);
      api.dispose();
    };
  }, [onApiReady]);

  return (
    <div ref={containerRef} className="flex-1 min-h-0 w-full h-full dockview-theme-abyss">
      {portals.map((target) => createPortal(renderPanelByName(target.component), target.element, target.id))}
    </div>
  );
};

export function resetDockviewLayout(api: DockviewApi | null): void {
  localStorage.removeItem(LAYOUT_STORAGE_KEY);
  if (!api) return;
  api.clear();
  createDefaultLayout(api);
}
