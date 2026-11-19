import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  Film,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Music,
  Play,
  Search,
} from 'lucide-react';
import type { AssetItem } from '../../engine/types';
import { importFileIntoWorkspace, pickLocalDirectoryAssets } from '../../services/opfsService';
import { useStudioStore } from '../../store/useStudioStore';

export const ProjectBrowserPanel: React.FC = () => {
  const project = useStudioStore((s) => s.project);
  const activeFolder = useStudioStore((s) => s.activeFolder);
  const setActiveFolder = useStudioStore((s) => s.setActiveFolder);
  const registerImportedAsset = useStudioStore((s) => s.registerImportedAsset);
  const deleteAsset = useStudioStore((s) => s.deleteAsset);
  const createFolder = useStudioStore((s) => s.createFolder);
  const createSceneNode = useStudioStore((s) => s.createSceneNode);

  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    let addedCount = 0;
    for (const file of Array.from(files)) {
      const imported = await importFileIntoWorkspace(file, activeFolder === '/' ? '/Sahneler' : activeFolder);
      if (imported) {
        registerImportedAsset(imported.asset, imported.bytes);
        setSelectedAssetId(imported.asset.id);
        addedCount++;
      }
    }
    if (addedCount > 0) {
      setStatusMsg(`${addedCount} file(s) imported to OPFS.`);
    } else {
      setStatusMsg('No supported video, audio, or image files found.');
    }
  };

  const handleLocalDirConnect = async () => {
    try {
      const res = await pickLocalDirectoryAssets(activeFolder === '/' ? '/Sahneler' : activeFolder);
      for (const item of res.assets) {
        registerImportedAsset(item.asset, item.bytes);
      }
      setStatusMsg(`Linked ${res.assets.length} file(s) from "${res.folderName}".`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Unable to link local directory.');
    }
  };

  const handleAddToScene = (asset: AssetItem) => {
    if (asset.kind === 'audio') {
      createSceneNode('audio', asset.id);
    } else {
      createSceneNode('video', asset.id);
    }
    setStatusMsg(`Added "${asset.name}" to Scene.`);
  };

  const filteredAssets = Object.values(project.assets).filter((a) => {
    if (search.trim() && !a.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (activeFolder !== '/' && a.folder !== activeFolder) return false;
    return true;
  });

  const handleDeleteSelected = () => {
    if (!selectedAssetId || !project.assets[selectedAssetId]) {
      setStatusMsg('Select a media item first to delete.');
      return;
    }
    const name = project.assets[selectedAssetId].name;
    deleteAsset(selectedAssetId);
    setSelectedAssetId(null);
    setStatusMsg(`Removed "${name}" from File System.`);
  };

  const handlePreviewSelected = () => {
    const target =
      (selectedAssetId && project.assets[selectedAssetId]) || filteredAssets[0];
    if (!target) {
      setStatusMsg('No media item available to preview.');
      return;
    }
    handleAddToScene(target);
  };

  return (
    <div
      className={`h-full flex flex-col bg-[#121622] text-slate-200 select-none ${
        dragOver ? 'ring-1 ring-inset ring-teal-400' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) {
          void handleFiles(e.dataTransfer.files);
        }
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,audio/*,image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void handleFiles(e.target.files);
        }}
      />

      {/* Top 4-Button Reference Action Row: Open / Delete / Preview / Explorer */}
      <div className="px-2.5 py-2 border-b border-white/[0.05] space-y-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-6 px-2.5 rounded-md bg-teal-500 hover:bg-teal-400 text-slate-950 text-[11px] font-semibold cursor-pointer whitespace-nowrap transition-colors"
          >
            Open
          </button>

          <button
            type="button"
            onClick={handleDeleteSelected}
            className="h-6 px-2.5 rounded-md bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/55 text-purple-200 text-[11px] font-medium cursor-pointer whitespace-nowrap transition-colors"
          >
            Delete
          </button>

          <button
            type="button"
            onClick={handlePreviewSelected}
            className="h-6 px-2.5 rounded-md bg-[#1a2030] hover:bg-[#232b40] border border-white/[0.1] text-slate-200 text-[11px] font-medium cursor-pointer whitespace-nowrap transition-colors"
          >
            Preview
          </button>

          <button
            type="button"
            onClick={() => void handleLocalDirConnect()}
            className="h-6 px-2.5 rounded-md bg-[#1a2030] hover:bg-[#232b40] border border-white/[0.1] text-slate-200 text-[11px] font-medium cursor-pointer whitespace-nowrap transition-colors"
          >
            Explorer
          </button>

          <button
            type="button"
            aria-label="Search media"
            title="Search media"
            onClick={() => setShowSearch((v) => !v)}
            className="ml-auto h-6 w-6 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer shrink-0"
          >
            <Search className="w-3 h-3" />
          </button>
        </div>

        {showSearch && (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter files..."
              aria-label="Search media"
              className="flex-1 min-w-0 h-6 px-2 text-[11px] bg-[#0b0e17] border border-white/[0.08] rounded text-slate-100 focus:outline-none focus:border-teal-400/70"
            />
            <button
              type="button"
              aria-label="New folder"
              title="New Folder"
              onClick={() => setShowFolderInput((v) => !v)}
              className="h-6 w-6 inline-flex items-center justify-center rounded bg-[#0b0e17] border border-white/[0.08] text-slate-300 hover:text-white cursor-pointer shrink-0"
            >
              <FolderPlus className="w-3 h-3" />
            </button>
          </div>
        )}

        {showFolderInput && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newFolderName.trim()) return;
              createFolder(newFolderName.trim());
              setNewFolderName('');
              setShowFolderInput(false);
            }}
            className="flex gap-1.5"
          >
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name..."
              aria-label="Folder name"
              className="flex-1 min-w-0 h-6 px-2 text-[11px] bg-[#0b0e17] border border-white/[0.08] rounded text-slate-100"
            />
            <button
              type="submit"
              className="px-2 h-6 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-[11px] rounded cursor-pointer whitespace-nowrap"
            >
              Add
            </button>
          </form>
        )}

        {activeFolder !== '/' && (
          <button
            type="button"
            onClick={() => setActiveFolder('/')}
            className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200 cursor-pointer"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>All Folders ({activeFolder.replace(/^\//, '')})</span>
          </button>
        )}
      </div>

      {statusMsg && (
        <div className="px-2.5 py-1 text-[11px] text-teal-200 bg-teal-500/10 border-b border-white/[0.05] flex items-center justify-between gap-2">
          <span className="truncate">{statusMsg}</span>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-slate-400 hover:text-white cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3-Column Reference Thumbnail & Folder Grid */}
      <div className="flex-1 overflow-y-auto p-2.5">
        <div className="grid grid-cols-3 gap-2.5">
          {activeFolder === '/' &&
            !search.trim() &&
            project.folders.map((folder) => (
              <button
                key={folder}
                type="button"
                onClick={() => setActiveFolder(folder)}
                className="group flex flex-col items-center gap-1 p-1.5 rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                <div className="w-full aspect-[4/3] rounded-md flex items-center justify-center">
                  <Folder className="w-10 h-10 text-cyan-400 fill-cyan-400/90 group-hover:scale-105 transition-transform" />
                </div>
                <span className="w-full text-center text-[11px] text-slate-300 truncate">
                  {folder.replace(/^\//, '')}
                </span>
              </button>
            ))}

          {filteredAssets.map((asset) => {
            const isSelected = selectedAssetId === asset.id;
            return (
              <button
                key={asset.id}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-kinoforge-asset', asset.id);
                }}
                onClick={() => setSelectedAssetId(asset.id)}
                onDoubleClick={() => handleAddToScene(asset)}
                title={`${asset.name} — Double-click to add to Scene`}
                className={`group flex flex-col items-center gap-1 p-1 rounded-lg transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-teal-500/15 ring-1 ring-teal-400/70'
                    : 'hover:bg-white/[0.05]'
                }`}
              >
                <div className="w-full aspect-[4/3] rounded-md overflow-hidden bg-[#090c14] border border-white/[0.06] relative flex items-center justify-center">
                  {asset.kind === 'image' && asset.url ? (
                    <>
                      <img
                        src={asset.url}
                        alt={asset.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="w-6 h-6 rounded-full bg-black/60 border border-white/30 flex items-center justify-center">
                          <Play className="w-3 h-3 text-white fill-white ml-0.5" />
                        </span>
                      </span>
                    </>
                  ) : asset.kind === 'video' ? (
                    <div className="w-full h-full bg-gradient-to-br from-slate-900 to-cyan-950/60 flex items-center justify-center">
                      <span className="w-7 h-7 rounded-full bg-white/15 border border-white/30 flex items-center justify-center">
                        <Film className="w-3.5 h-3.5 text-cyan-300" />
                      </span>
                    </div>
                  ) : asset.kind === 'audio' ? (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-500/80 to-purple-600/85 flex items-center justify-center">
                      <Music className="w-6 h-6 text-white" />
                    </div>
                  ) : (
                    <ImageIcon className="w-5 h-5 text-slate-600" />
                  )}
                </div>

                <span className="w-full text-center text-[11px] text-slate-300 truncate">
                  {asset.name}
                </span>
              </button>
            );
          })}
        </div>

        {filteredAssets.length === 0 && (
          <div className="mt-3 py-6 border border-dashed border-white/[0.1] rounded-lg text-center">
            <p className="text-[11px] text-slate-500">Drop media files here or click Open.</p>
          </div>
        )}
      </div>
    </div>
  );
};
