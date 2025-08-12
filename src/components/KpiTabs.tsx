// src/components/KpiTabs.tsx
"use client";
import { useState } from "react";
import type { KpiGroup } from "@/types/kpi";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensors,
  useSensor,
  DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Props = {
  groups: KpiGroup[];
  active: number;
  onSelect(i: number): void;
  onRename(i: number, name: string): void;
  onAdd(): void;
  onRemove(i: number): void;
  onMove(i: number, dir: -1 | 1): void;     // 既存の左右ボタン
  onDuplicate(i: number): void;
  onReorder(from: number, to: number): void; // ★ 追加：ドラッグで並べ替え
};

export default function KpiTabs({
  groups,
  active,
  onSelect,
  onRename,
  onAdd,
  onRemove,
  onMove,
  onDuplicate,
  onReorder,
}: Props) {
  const [editing, setEditing] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active: act, over } = e;
    if (!over || act.id === over.id) return;
    const from = groups.findIndex((g) => g.id === act.id);
    const to = groups.findIndex((g) => g.id === over.id);
    if (from !== -1 && to !== -1 && from !== to) onReorder(from, to);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={groups.map((g) => g.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex flex-wrap items-center gap-2">
            {groups.map((g, i) => (
              <SortableTab
                key={g.id}
                id={g.id}
                name={g.name}
                active={i === active}
                onClick={() => onSelect(i)}
                onStartEdit={() => setEditing(i)}
                onRename={(name) => {
                  onRename(i, name);
                  setEditing(null);
                }}
                onMoveLeft={() => onMove(i, -1)}
                onMoveRight={() => onMove(i, +1)}
                onDuplicate={() => onDuplicate(i)}
                onRemove={() => onRemove(i)}
                isEditing={editing === i}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button className="ml-auto rounded-md border px-3 py-1.5 hover:bg-gray-50" onClick={onAdd}>
        ＋ グループ
      </button>
    </div>
  );
}

function SortableTab({
  id,
  name,
  active,
  onClick,
  onStartEdit,
  onRename,
  onMoveLeft,
  onMoveRight,
  onDuplicate,
  onRemove,
  isEditing,
}: {
  id: string;
  name: string;
  active: boolean;
  onClick(): void;
  onStartEdit(): void;
  onRename(name: string): void;
  onMoveLeft(): void;
  onMoveRight(): void;
  onDuplicate(): void;
  onRemove(): void;
  isEditing: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        "group flex items-center gap-1 rounded-full border px-2 py-1 " +
        (active ? "bg-white shadow ring-1 ring-sky-200" : "bg-slate-50 hover:bg-white")
      }
    >
      <button
        className="cursor-grab px-1 text-xs text-gray-500 hover:text-gray-700"
        title="ドラッグで並べ替え"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>

      <button
        className={"px-1.5 py-0.5 rounded-full text-sm " + (active ? "font-semibold" : "")}
        onClick={onClick}
        title={name}
      >
        {isEditing ? (
          <input
            className="border rounded px-2 py-0.5 text-sm"
            defaultValue={name}
            onBlur={(e) => onRename(e.currentTarget.value.trim() || name)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") onRename(name);
            }}
            autoFocus
            style={{ width: Math.max(80, name.length * 12) }}
          />
        ) : (
          name
        )}
      </button>

      {/* 操作群（ホバーで表示） */}
      <div className="hidden group-hover:flex items-center">
        <button className="ml-1 rounded px-1 text-xs hover:bg-slate-100" onClick={onStartEdit} title="名前を変更">
          ✎
        </button>
        <button className="rounded px-1 text-xs hover:bg-slate-100" onClick={onMoveLeft} title="左へ">
          ←
        </button>
        <button className="rounded px-1 text-xs hover:bg-slate-100" onClick={onMoveRight} title="右へ">
          →
        </button>
        <button className="rounded px-1 text-xs hover:bg-slate-100" onClick={onDuplicate} title="複製">
          ⧉
        </button>
        <button className="rounded px-1 text-xs hover:bg-slate-100 text-red-600" onClick={onRemove} title="削除">
          ×
        </button>
      </div>
    </div>
  );
}
