import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { ISC_REGISTRY } from '../../engine/iscRegistry';
import type { AnchorPreset, IscComponentType, IscSchemaField } from '../../engine/types';
import { useStudioStore } from '../../store/useStudioStore';

const ANCHOR_GRID: { value: AnchorPreset; label: string }[] = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-center', label: 'Top Center' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'middle-left', label: 'Middle Left' },
  { value: 'center', label: 'Center' },
  { value: 'middle-right', label: 'Middle Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-center', label: 'Bottom Center' },
  { value: 'bottom-right', label: 'Bottom Right' },
];

const TealSwitch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}> = ({ checked, onChange, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
      checked ? 'bg-teal-500' : 'bg-[#2a3145]'
    }`}
  >
    <span
      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
        checked ? 'translate-x-3.5' : 'translate-x-0.5'
      }`}
    />
  </button>
);

export const InspectorPanel: React.FC = () => {
  const project = useStudioStore((s) => s.project);
  const activeClipId = useStudioStore((s) => s.activeClipId);
  const selectedNodeId = useStudioStore((s) => s.selectedNodeId);
  const updateNodeMeta = useStudioStore((s) => s.updateNodeMeta);
  const updateNodeTransform = useStudioStore((s) => s.updateNodeTransform);
  const updateComponentParams = useStudioStore((s) => s.updateComponentParams);
  const toggleComponentEnabled = useStudioStore((s) => s.toggleComponentEnabled);
  const addComponentToNode = useStudioStore((s) => s.addComponentToNode);
  const removeComponentFromNode = useStudioStore((s) => s.removeComponentFromNode);

  const [newCompType, setNewCompType] = useState<IscComponentType>('EventTrigger');
  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>({
    transform: true,
    dock: true,
  });
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  const activeClip = project.clips[activeClipId];
  const node = selectedNodeId && activeClip ? activeClip.nodes[selectedNodeId] : null;

  if (!node) {
    return (
      <div className="h-full bg-[#121622] flex items-center justify-center p-6 text-center">
        <div className="max-w-[210px] space-y-1.5">
          <p className="text-xs font-semibold text-slate-300">No Layer Selected</p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Select a node from Hierarchy, Scene, or Time Line to inspect its properties.
          </p>
        </div>
      </div>
    );
  }

  const inputClass =
    'w-full h-6 px-2 text-[11px] bg-[#0b0e17] border border-white/[0.08] rounded text-slate-100 focus:outline-none focus:border-teal-400/70 transition-colors';
  const numInputClass = `${inputClass} font-mono tabular-nums`;

  const renderFieldControl = (compId: string, field: IscSchemaField, value: unknown) => {
    const inputId = `${compId}-${field.key}`;

    switch (field.type) {
      case 'string':
        return (
          <input
            id={inputId}
            type="text"
            value={String(value ?? '')}
            onChange={(e) =>
              updateComponentParams(activeClipId, node.id, compId, { [field.key]: e.target.value })
            }
            className={inputClass}
          />
        );

      case 'textarea':
        return (
          <textarea
            id={inputId}
            rows={2}
            value={String(value ?? '')}
            onChange={(e) =>
              updateComponentParams(activeClipId, node.id, compId, { [field.key]: e.target.value })
            }
            className="w-full p-1.5 text-[11px] bg-[#0b0e17] border border-white/[0.08] rounded text-slate-100 focus:outline-none focus:border-teal-400/70 resize-y"
          />
        );

      case 'number':
        return (
          <input
            id={inputId}
            type="number"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={Number(value ?? 0)}
            onChange={(e) =>
              updateComponentParams(activeClipId, node.id, compId, { [field.key]: Number(e.target.value) })
            }
            className={numInputClass}
          />
        );

      case 'range':
        return (
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              type="range"
              min={field.min ?? 0}
              max={field.max ?? 1}
              step={field.step ?? 0.05}
              value={Number(value ?? 0)}
              onChange={(e) =>
                updateComponentParams(activeClipId, node.id, compId, { [field.key]: Number(e.target.value) }, false)
              }
              className="flex-1 studio-slider cursor-pointer"
            />
            <span className="w-9 text-right text-[10px] font-mono tabular-nums text-slate-300">
              {Number(value ?? 0).toFixed(2)}
            </span>
          </div>
        );

      case 'color':
        return (
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              type="color"
              aria-label={field.label}
              value={String(value ?? '#3b82f6')}
              onChange={(e) =>
                updateComponentParams(activeClipId, node.id, compId, { [field.key]: e.target.value })
              }
              className="h-6 w-10 bg-[#0b0e17] border border-white/[0.1] rounded cursor-pointer p-0.5"
            />
            <span className="text-[10px] font-mono text-slate-400">{String(value ?? '')}</span>
          </div>
        );

      case 'boolean':
        return (
          <TealSwitch
            checked={Boolean(value)}
            ariaLabel={field.label}
            onChange={(checked) =>
              updateComponentParams(activeClipId, node.id, compId, { [field.key]: checked })
            }
          />
        );

      case 'select':
        return (
          <select
            id={inputId}
            value={String(value ?? '')}
            onChange={(e) =>
              updateComponentParams(activeClipId, node.id, compId, { [field.key]: e.target.value })
            }
            className={inputClass}
          >
            {(field.options ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'asset': {
        const compatible = Object.values(project.assets).filter(
          (a) => !field.assetKinds || field.assetKinds.includes(a.kind),
        );
        return (
          <select
            id={inputId}
            value={String(value ?? '')}
            onChange={(e) =>
              updateComponentParams(activeClipId, node.id, compId, { [field.key]: e.target.value })
            }
            className={inputClass}
          >
            <option value="">— Select Asset —</option>
            {compatible.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name} ({asset.kind})
              </option>
            ))}
          </select>
        );
      }

      case 'clipRef':
        return (
          <select
            id={inputId}
            value={String(value ?? '')}
            onChange={(e) =>
              updateComponentParams(activeClipId, node.id, compId, { [field.key]: e.target.value })
            }
            className={inputClass}
          >
            <option value="">— Target Clip —</option>
            {project.clipOrder.map((cid) => (
              <option key={cid} value={cid}>
                {project.clips[cid]?.name ?? cid}
              </option>
            ))}
          </select>
        );

      case 'nodeRef':
        return (
          <select
            id={inputId}
            value={String(value ?? '')}
            onChange={(e) =>
              updateComponentParams(activeClipId, node.id, compId, { [field.key]: e.target.value })
            }
            className={inputClass}
          >
            <option value="">— Target Layer —</option>
            {Object.values(activeClip.nodes).map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        );
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#121622] text-slate-200 divide-y divide-white/[0.06] select-none">
      {/* Name & Size Section */}
      <section className="px-3 py-2.5 space-y-2">
        <div className="space-y-1">
          <label htmlFor="inspector-node-name" className="block text-[11px] font-medium text-slate-300">
            Name
          </label>
          <input
            id="inspector-node-name"
            type="text"
            value={node.name}
            onChange={(e) => updateNodeMeta(activeClipId, node.id, { name: e.target.value })}
            className="w-full h-7 px-2 text-xs font-medium bg-[#0b0e17] border border-white/[0.08] rounded text-slate-100 focus:outline-none focus:border-teal-400/70"
          />
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <span className="text-[11px] font-medium text-slate-300">Visible</span>
          <TealSwitch
            checked={node.visible}
            ariaLabel="Toggle layer visibility"
            onChange={(checked) => updateNodeMeta(activeClipId, node.id, { visible: checked })}
          />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label htmlFor="inspector-start-ms" className="block text-[10px] text-slate-500 mb-0.5">
              Start (ms)
            </label>
            <input
              id="inspector-start-ms"
              type="number"
              min={0}
              step={100}
              value={node.startTime}
              onChange={(e) => updateNodeMeta(activeClipId, node.id, { startTime: Number(e.target.value) })}
              className={numInputClass}
            />
          </div>
          <div>
            <label htmlFor="inspector-duration-ms" className="block text-[10px] text-slate-500 mb-0.5">
              Duration (ms)
            </label>
            <input
              id="inspector-duration-ms"
              type="number"
              min={200}
              step={100}
              value={node.duration}
              onChange={(e) => updateNodeMeta(activeClipId, node.id, { duration: Number(e.target.value) })}
              className={numInputClass}
            />
          </div>
        </div>
      </section>

      {/* Transform Section matching reference X / Y compact grid */}
      <section className="px-3 py-2.5 space-y-2">
        <button
          type="button"
          onClick={() => setSectionsOpen((s) => ({ ...s, transform: !s.transform }))}
          className="w-full flex items-center justify-between text-xs font-semibold text-slate-200 cursor-pointer"
        >
          <span>Transform</span>
          {sectionsOpen.transform ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>

        {sectionsOpen.transform && (
          <div className="space-y-1.5 pt-0.5">
            {/* Position X / Y */}
            <div className="grid grid-cols-[64px_1fr] items-center gap-2">
              <span className="text-[11px] text-slate-400">Position</span>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex items-center gap-1">
                  <label htmlFor="tf-x" className="text-[10px] text-slate-500">X</label>
                  <input
                    id="tf-x"
                    type="number"
                    value={Math.round(node.transform.x)}
                    onChange={(e) => updateNodeTransform(activeClipId, node.id, { x: Number(e.target.value) })}
                    className={numInputClass}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <label htmlFor="tf-y" className="text-[10px] text-slate-500">Y</label>
                  <input
                    id="tf-y"
                    type="number"
                    value={Math.round(node.transform.y)}
                    onChange={(e) => updateNodeTransform(activeClipId, node.id, { y: Number(e.target.value) })}
                    className={numInputClass}
                  />
                </div>
              </div>
            </div>

            {/* Size W / H */}
            <div className="grid grid-cols-[64px_1fr] items-center gap-2">
              <span className="text-[11px] text-slate-400">Scale</span>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex items-center gap-1">
                  <label htmlFor="tf-w" className="text-[10px] text-slate-500">W</label>
                  <input
                    id="tf-w"
                    type="number"
                    min={20}
                    value={Math.round(node.transform.width)}
                    onChange={(e) =>
                      updateNodeTransform(activeClipId, node.id, { width: Math.max(20, Number(e.target.value)) })
                    }
                    className={numInputClass}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <label htmlFor="tf-h" className="text-[10px] text-slate-500">H</label>
                  <input
                    id="tf-h"
                    type="number"
                    min={20}
                    value={Math.round(node.transform.height)}
                    onChange={(e) =>
                      updateNodeTransform(activeClipId, node.id, { height: Math.max(20, Number(e.target.value)) })
                    }
                    className={numInputClass}
                  />
                </div>
              </div>
            </div>

            {/* Rotation */}
            <div className="grid grid-cols-[64px_1fr] items-center gap-2">
              <label htmlFor="tf-rot" className="text-[11px] text-slate-400">Rotation</label>
              <div className="flex items-center gap-2">
                <input
                  id="tf-rot"
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={node.transform.rotation}
                  onChange={(e) =>
                    updateNodeTransform(activeClipId, node.id, { rotation: Number(e.target.value) }, false)
                  }
                  className="flex-1 studio-slider cursor-pointer"
                />
                <span className="w-8 text-right text-[10px] font-mono tabular-nums text-slate-300">
                  {Math.round(node.transform.rotation)}°
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Dock / Anchor Section */}
      <section className="px-3 py-2.5 space-y-2">
        <button
          type="button"
          onClick={() => setSectionsOpen((s) => ({ ...s, dock: !s.dock }))}
          className="w-full flex items-center justify-between text-xs font-semibold text-slate-200 cursor-pointer"
        >
          <span>Dock</span>
          {sectionsOpen.dock ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>

        {sectionsOpen.dock && (
          <div className="flex items-center justify-between gap-3 pt-0.5">
            <div className="flex items-center gap-2">
              <TealSwitch
                checked={node.transform.anchor === 'stretch'}
                ariaLabel="Toggle Full Screen Stretch Dock"
                onChange={(stretch) =>
                  updateNodeTransform(activeClipId, node.id, { anchor: stretch ? 'stretch' : 'center' })
                }
              />
              <span className="text-[11px] text-slate-400">
                {node.transform.anchor === 'stretch' ? 'Stretch' : node.transform.anchor}
              </span>
            </div>

            <div
              role="group"
              aria-label="Anchor Matrix"
              className="grid grid-cols-3 gap-0.5 p-1 rounded bg-[#0b0e17] border border-white/[0.07]"
            >
              {ANCHOR_GRID.map((preset) => {
                const active = node.transform.anchor === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    title={preset.label}
                    aria-label={`Anchor: ${preset.label}`}
                    aria-pressed={active}
                    onClick={() => updateNodeTransform(activeClipId, node.id, { anchor: preset.value })}
                    className={`w-3.5 h-3.5 rounded-[2px] flex items-center justify-center cursor-pointer transition-colors ${
                      active ? 'bg-teal-500/35 ring-1 ring-teal-400' : 'hover:bg-white/[0.08]'
                    }`}
                  >
                    <span
                      className={`w-1 h-1 rounded-full ${
                        active ? 'bg-teal-300' : 'bg-slate-600'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Collapsible .isc Component Sections (Material, Event, Font, VideoSource, Audio) */}
      {node.components.map((comp, idx) => {
        const schema = ISC_REGISTRY[comp.type];
        const isExpanded = expandedMap[comp.id] ?? idx === 0;

        return (
          <section key={comp.id} className="bg-[#121622]">
            <div className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-white/[0.02] transition-colors">
              <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() => setExpandedMap((prev) => ({ ...prev, [comp.id]: !isExpanded }))}
                className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )}
                <span className="text-xs font-semibold text-slate-200 truncate">{schema.label}</span>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                <TealSwitch
                  checked={comp.enabled}
                  ariaLabel={`Enable ${schema.label}`}
                  onChange={() => toggleComponentEnabled(activeClipId, node.id, comp.id)}
                />

                <button
                  type="button"
                  aria-label={`Remove ${schema.label}`}
                  onClick={() => removeComponentFromNode(activeClipId, node.id, comp.id)}
                  className="p-0.5 text-slate-500 hover:text-rose-400 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="px-3 pb-3 pt-0.5 space-y-2">
                {schema.fields.map((field) => (
                  <div key={field.key} className="grid grid-cols-[88px_1fr] items-center gap-2">
                    <label
                      htmlFor={`${comp.id}-${field.key}`}
                      className="text-[11px] text-slate-400 truncate"
                      title={field.label}
                    >
                      {field.label}
                    </label>
                    <div className="min-w-0">
                      {renderFieldControl(comp.id, field, comp.params[field.key])}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* Add .isc Component */}
      <section className="px-3 py-2.5 space-y-1.5">
        <label htmlFor="add-isc-select" className="block text-[11px] font-medium text-slate-400">
          Add Component (.isc)
        </label>
        <div className="flex items-center gap-1.5">
          <select
            id="add-isc-select"
            value={newCompType}
            onChange={(e) => setNewCompType(e.target.value as IscComponentType)}
            className="flex-1 min-w-0 h-7 px-2 text-[11px] bg-[#0b0e17] border border-white/[0.08] rounded text-slate-100"
          >
            {Object.values(ISC_REGISTRY).map((s) => (
              <option key={s.type} value={s.type}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => addComponentToNode(activeClipId, node.id, newCompType)}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded bg-teal-500 hover:bg-teal-400 text-[11px] font-semibold text-slate-950 cursor-pointer whitespace-nowrap transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
      </section>
    </div>
  );
};
