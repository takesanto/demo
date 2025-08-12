// src/components/KpiColumns.tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import UnitEditor from "@/components/UnitEditor";
import LinkPicker from "@/components/LinkPicker";
import type { KpiNode, Operator, NodePath } from "@/types/kpi";
import {
  createNode,
  appendChild,
  removeChildAt,
  setOpAt,
  moveChild,
  formatFormula,
  cloneWithNewIds,
  getNodeByPath,
  updateNodeByPath,
} from "@/types/kpi";

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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Props = {
  roots: KpiNode[];
  onChange(next: KpiNode[]): void;
  onSelectionChange?(path: NodePath, node: KpiNode | null): void;
  groupName?: string;
};

const OpBtn = ({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick(): void;
}) => (
  <button
    className={
      "px-2 py-1 text-sm rounded-md " +
      (active ? "bg-white shadow font-semibold" : "hover:bg-white/70")
    }
    onClick={onClick}
  >
    {label}
  </button>
);

export default function KpiColumns({ roots, onChange, onSelectionChange, groupName }: Props) {
  const [path, setPath] = useState<NodePath>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // 行ごとの「詳細（単位・リンク）パネル」開閉
  const [advOpen, setAdvOpen] = useState<Record<string, boolean>>({});
  const toggleAdv = (id: string) => setAdvOpen((m) => ({ ...m, [id]: !m[id] }));

  // path が壊れたら補正
  useEffect(() => {
    const fixed: NodePath = [];
    let level = roots;
    for (const id of path) {
      const found = level.find((n) => n.id === id);
      if (!found) break;
      fixed.push(id);
      level = found.children;
    }
    if (fixed.length !== path.length) setPath(fixed);
  }, [roots]); // eslint-disable-line

  const selected = useMemo(() => getNodeByPath(roots, path), [roots, path]);

  // ROOT列 + 選択経路分の列を構築
  const columns = useMemo(() => {
    const cols: { parent: KpiNode | null; items: KpiNode[]; ops: Operator[] }[] = [];
    cols.push({ parent: null, items: roots, ops: [] });
    let level = roots;
    for (const id of path) {
      const p = level.find((n) => n.id === id);
      if (!p) break;
      cols.push({ parent: p, items: p.children, ops: p.ops ?? [] });
      level = p.children;
    }
    return cols;
  }, [roots, path]);

  // 右端へ自動スクロール
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [columns.length]);

  // ---- 親（列タイトル対象）の操作 ----
  const setParentName = (parentPath: NodePath, name: string) =>
    onChange(updateNodeByPath(roots, parentPath, (n) => ({ ...n, name })));

  const setParentUnit = (parentPath: NodePath, unit: string) =>
    onChange(updateNodeByPath(roots, parentPath, (n) => ({ ...n, unit })));

  const setParentKind = (parentPath: NodePath, kind: "leaf" | "calc") =>
    onChange(
      updateNodeByPath(roots, parentPath, (n) => {
        if (kind === "calc") {
          const need = Math.max(0, n.children.length - 1);
          const ops = Array.from({ length: need }, (_, i) => n.ops?.[i] ?? "*");
          return { ...n, kind, ops };
        }
        return { ...n, kind, ops: [] };
      })
    );

  const setParentVarKey = (parentPath: NodePath, varKey: string) =>
    onChange(updateNodeByPath(roots, parentPath, (n) => ({ ...n, varKey })));

  const setParentLinkCalc = (parentPath: NodePath, calcId: string | null) =>
    onChange(
      updateNodeByPath(roots, parentPath, (n) => ({
        ...n,
        link: calcId ? { type: "calc", key: calcId } : undefined,
      }))
    );

  const addChild = (parentPath: NodePath, childKind: "leaf" | "calc") =>
    onChange(
      updateNodeByPath(roots, parentPath, (n) =>
        appendChild(n.kind === "calc" ? n : { ...n, kind: "calc" }, createNode("子ノード", childKind))
      )
    );

  // ---- 子行の操作 ----
  const renameChild = (parentPath: NodePath, idx: number, name: string) =>
    onChange(
      updateNodeByPath(roots, parentPath, (p) => {
        const children = [...p.children];
        children[idx] = { ...children[idx], name };
        return { ...p, children };
      })
    );

  const setChildUnit = (parentPath: NodePath, idx: number, unit: string) =>
    onChange(
      updateNodeByPath(roots, parentPath, (p) => {
        const children = [...p.children];
        children[idx] = { ...children[idx], unit };
        return { ...p, children };
      })
    );

  const setChildVarKey = (parentPath: NodePath, idx: number, varKey: string) =>
    onChange(
      updateNodeByPath(roots, parentPath, (p) => {
        const cs = [...p.children];
        cs[idx] = { ...cs[idx], varKey };
        return { ...p, children: cs };
      })
    );

  const setChildLinkCalc = (parentPath: NodePath, idx: number, calcId: string | null) =>
    onChange(
      updateNodeByPath(roots, parentPath, (p) => {
        const cs = [...p.children];
        cs[idx] = { ...cs[idx], link: calcId ? { type: "calc", key: calcId } : undefined };
        return { ...p, children: cs };
      })
    );

  const toggleChildKind = (parentPath: NodePath, idx: number) =>
    onChange(
      updateNodeByPath(roots, parentPath, (p) => {
        const children = [...p.children];
        const c = children[idx];
        const nextKind = c.kind === "leaf" ? "calc" : "leaf";
        children[idx] =
          nextKind === "calc"
            ? { ...c, kind: "calc", ops: Array.from({ length: Math.max(0, c.children.length - 1) }, () => "*") }
            : { ...c, kind: "leaf", ops: [] };
        return { ...p, children };
      })
    );

  const removeChild = (parentPath: NodePath, idx: number) =>
    onChange(updateNodeByPath(roots, parentPath, (p) => removeChildAt(p, idx)));

  const moveChildUp = (parentPath: NodePath, idx: number) =>
    idx > 0 && onChange(updateNodeByPath(roots, parentPath, (p) => moveChild(p, idx, idx - 1)));

  const moveChildDown = (parentPath: NodePath, idx: number) =>
    onChange(updateNodeByPath(roots, parentPath, (p) => moveChild(p, idx, idx + 1)));

  const setOp = (parentPath: NodePath, idx: number, op: Operator) =>
    onChange(updateNodeByPath(roots, parentPath, (p) => setOpAt(p, idx, op)));

  // ---- ルート操作（ドラッグ対応） ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleRootDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = roots.findIndex((r) => r.id === active.id);
    const to = roots.findIndex((r) => r.id === over.id);
    if (from !== -1 && to !== -1 && from !== to) {
      onChange(arrayMove(roots, from, to));
      // 選択補正
      if (path[0] && (roots[from]?.id === path[0] || roots[to]?.id === path[0])) {
        const moved = arrayMove(roots, from, to);
        const newIndex = moved.findIndex((r) => r.id === path[0]);
        if (newIndex === -1) setPath([]);
      }
    }
  };

  const selectAt = (colIndex: number, id: string) => {
    const next = [...path.slice(0, colIndex), id];
    setPath(next);
  };

  // パンくず
  const crumbs = useMemo(() => {
    const list: { id: string | null; name: string; depth: number }[] = [
      { id: null, name: groupName ? groupName : "ルート", depth: 0 },
    ];
    let cur: NodePath = [];
    for (let i = 0; i < path.length; i++) {
      cur = [...cur, path[i]];
      const n = getNodeByPath(roots, cur);
      if (!n) break;
      list.push({ id: n.id, name: n.name, depth: i + 1 });
    }
    return list;
  }, [roots, path, groupName]);

  useEffect(() => {
    onSelectionChange?.(path, selected);
  }, [path, selected]); // eslint-disable-line

  return (
    <div className="space-y-3">
      {/* パンくず */}
      <div className="text-sm text-gray-600">
        {crumbs.map((c, i) => (
          <span key={c.depth} className="inline-flex items-center">
            <button
              className={"px-1 rounded hover:bg-slate-100 " + (i === crumbs.length - 1 ? "font-semibold" : "")}
              onClick={() => setPath(path.slice(0, i))}
              disabled={i === crumbs.length - 1}
              title={c.name}
            >
              {c.name}
            </button>
            {i < crumbs.length - 1 && <span className="mx-1 text-gray-300">›</span>}
          </span>
        ))}
      </div>

      {/* カラム群 */}
      <div ref={containerRef} className="overflow-x-auto">
        <div className="flex items-start gap-4 min-h-[240px]">
          {columns.map((col, colIndex) => {
            const parentPath: NodePath = col.parent ? path.slice(0, colIndex) : [];
            const selectedNextId = path[colIndex] ?? null;

            return (
              <div
                key={colIndex}
                className="min-w-[400px] w-[440px] md:w-[520px] bg-white rounded-2xl p-4 shadow-sm overflow-hidden"
              >
                {/* ヘッダー（2段構成に変更） */}
                {col.parent ? (
                  <div className="mb-2">
                    <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
                      <span className="text-xs px-2 py-1 rounded bg-slate-100">深さ {colIndex}</span>

                      {/* 親：名前 */}
                      <input
                        className="border rounded px-2 py-1 text-sm w-full min-w-0"
                        value={col.parent.name}
                        onChange={(e) => setParentName(parentPath, e.target.value)}
                        aria-label="ノード名"
                        placeholder="項目名"
                      />

                      {/* 種別切替 */}
                      <div className="inline-flex rounded-md border bg-slate-50 p-0.5 justify-self-end shrink-0">
                        <button
                          className={"px-2 py-1 text-xs rounded-md " + (col.parent.kind === "leaf" ? "bg-white shadow" : "hover:bg-white/60")}
                          onClick={() => setParentKind(parentPath, "leaf")}
                        >
                          leaf
                        </button>
                        <button
                          className={"px-2 py-1 text-xs rounded-md " + (col.parent.kind === "calc" ? "bg-white shadow" : "hover:bg-white/60")}
                          onClick={() => setParentKind(parentPath, "calc")}
                        >
                          calc
                        </button>
                      </div>
                    </div>

                    {/* ★ 親：詳細（単位・リンク）→ 2行目で広く */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <UnitEditor value={col.parent.unit} onChange={(u) => setParentUnit(parentPath, u)} />
                      <LinkPicker
                        roots={roots}
                        node={col.parent}
                        canLinkInput={col.parent.kind === "leaf"}
                        onSelectInput={(k) => setParentVarKey(parentPath, k)}
                        onClearInput={() => setParentVarKey(parentPath, "")}
                        onSelectCalc={(id) => setParentLinkCalc(parentPath, id)}
                        onClearLink={() => setParentLinkCalc(parentPath, null)}
                      />
                      <div className="ml-auto flex gap-2">
                        <button className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50" onClick={() => addChild(parentPath, "leaf")}>
                          ＋ Leaf
                        </button>
                        <button className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50" onClick={() => addChild(parentPath, "calc")}>
                          ＋ Calc
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-2 grid grid-cols-[auto_1fr] gap-2 items-center">
                    <span className="text-xs px-2 py-1 rounded bg-slate-100 justify-self-start">ROOT</span>
                    <div className="font-medium">ルート一覧</div>

                    <div className="col-span-2 flex flex-wrap justify-end gap-2">
                      <button className="rounded-md border px-3 py-1 text-xs hover:bg-gray-50" onClick={() => onChange([...roots, createNode("新しいKPI", "calc")])}>
                        ＋ ルート（calc）
                      </button>
                      <button className="rounded-md border px-3 py-1 text-xs hover:bg-gray-50" onClick={() => onChange([...roots, createNode("概念ノード", "leaf")])}>
                        ＋ ルート（leaf）
                      </button>
                    </div>
                  </div>
                )}

                {/* 本体：ROOT列だけ DnD 対応 */}
                {col.items.length === 0 ? (
                  <div className="text-xs text-gray-500">
                    {col.parent ? "子がありません。『＋ Leaf / ＋ Calc』で追加。" : "ルートがありません。『＋ ルート』で追加。"}
                  </div>
                ) : col.parent ? (
                  // 子列（通常のボタン操作）
                  <div className="space-y-2">
                    {col.items.map((item, i) => {
                      const isActive = selectedNextId === item.id;
                      const open = !!advOpen[item.id];

                      return (
                        <div key={item.id} className="space-y-1">
                          {/* 1段目：スリム行（名前・種別・操作） */}
                          <div
                            className={
                              "flex items-center gap-2 border rounded-lg px-2 py-1 cursor-pointer " +
                              (isActive ? "bg-sky-50 border-sky-200" : "hover:bg-slate-50")
                            }
                            onClick={() => selectAt(colIndex, item.id)}
                          >
                            <input
                              className="bg-transparent px-1 text-sm w-full min-w-0"
                              value={item.name}
                              onChange={(e) => renameChild(parentPath, i, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                            />

                            <span
                              className={
                                "text-[10px] rounded px-1.5 py-0.5 shrink-0 " +
                                (item.kind === "leaf" ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700")
                              }
                            >
                              {item.kind}
                            </span>

                            {/* 詳細トグル */}
                            <button
                              className={"rounded px-1 text-xs hover:bg-white " + (open ? "font-semibold" : "")}
                              title="詳細（単位・リンク）"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleAdv(item.id);
                              }}
                            >
                              ⚙
                            </button>

                            <div className="ml-1 flex items-center gap-1 shrink-0">
                              <button
                                className="rounded px-1 text-xs hover:bg-white"
                                title="leaf/calc 切替"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleChildKind(parentPath, i);
                                }}
                              >
                                ⟳
                              </button>
                              <button
                                className="rounded px-1 text-xs hover:bg-white"
                                title="上へ"
                                disabled={i === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveChildUp(parentPath, i);
                                }}
                              >
                                ↑
                              </button>
                              <button
                                className="rounded px-1 text-xs hover:bg-white"
                                title="下へ"
                                disabled={i === col.items.length - 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveChildDown(parentPath, i);
                                }}
                              >
                                ↓
                              </button>
                              <button
                                className="rounded px-1 text-xs hover:bg-white text-red-600"
                                title="削除"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeChild(parentPath, i);
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </div>

                          {/* 2段目：演算子 */}
                          {col.parent && col.parent.kind === "calc" && i < col.items.length - 1 && (
                            <div className="inline-flex rounded-md border bg-slate-50 p-0.5 ml-10">
                              {(["+", "-", "*", "/"] as Operator[]).map((op) => (
                                <OpBtn
                                  key={op}
                                  label={op === "+" ? "＋" : op === "-" ? "−" : op === "*" ? "×" : "÷"}
                                  active={(col.ops?.[i] ?? "*") === op}
                                  onClick={() => setOp(parentPath, i, op)}
                                />
                              ))}
                            </div>
                          )}

                          {/* 3段目：詳細（折りたたみ） */}
                          {open && (
                            <div className="rounded-lg border bg-slate-50 px-2 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <UnitEditor
                                  value={item.unit}
                                  onChange={(u) => setChildUnit(parentPath, i, u)}
                                />
                                <LinkPicker
                                  roots={roots}
                                  node={item}
                                  canLinkInput={item.kind === "leaf"}
                                  onSelectInput={(k) => setChildVarKey(parentPath, i, k)}
                                  onClearInput={() => setChildVarKey(parentPath, i, "")}
                                  onSelectCalc={(id) => setChildLinkCalc(parentPath, i, id)}
                                  onClearLink={() => setChildLinkCalc(parentPath, i, null)}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // ★ ROOT列（ドラッグで並べ替え）
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRootDragEnd}>
                    <SortableContext items={roots.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {roots.map((item) => {
                          const open = !!advOpen[item.id];
                          return (
                            <SortableRootRow
                              key={item.id}
                              item={item}
                              open={open}
                              toggleOpen={() => toggleAdv(item.id)}
                              selected={selectedNextId === item.id}
                              onClick={() => selectAt(colIndex, item.id)}
                              rename={(name) =>
                                onChange(roots.map((r) => (r.id === item.id ? { ...r, name } : r)))
                              }
                              setUnit={(u) =>
                                onChange(roots.map((r) => (r.id === item.id ? { ...r, unit: u } : r)))
                              }
                              setVarKey={(k) =>
                                onChange(roots.map((r) => (r.id === item.id ? { ...r, varKey: k } : r)))
                              }
                              linkCalc={(idOrNull) =>
                                onChange(
                                  roots.map((r) =>
                                    r.id === item.id
                                      ? { ...r, link: idOrNull ? { type: "calc", key: idOrNull } : undefined }
                                      : r
                                  )
                                )
                              }
                              toggleKind={() =>
                                onChange(
                                  roots.map((r) =>
                                    r.id === item.id
                                      ? r.kind === "leaf"
                                        ? {
                                            ...r,
                                            kind: "calc",
                                            ops: Array.from(
                                              { length: Math.max(0, r.children.length - 1) },
                                              () => "*"
                                            ),
                                          }
                                        : { ...r, kind: "leaf", ops: [] }
                                      : r
                                  )
                                )
                              }
                              duplicate={() => {
                                const idx = roots.findIndex((r) => r.id === item.id);
                                const next = [...roots];
                                next.splice(idx + 1, 0, cloneWithNewIds(item));
                                onChange(next);
                              }}
                              remove={() => {
                                const idx = roots.findIndex((r) => r.id === item.id);
                                const next = roots.filter((_, j) => j !== idx);
                                onChange(next);
                                if (path[0] && item.id === path[0]) setPath([]);
                              }}
                            />
                          );
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}

                {/* 親ノードの式プレビュー（calc のみ） */}
                {col.parent && col.parent.kind === "calc" && (
                  <div className="mt-3 text-xs bg-slate-50 p-2 rounded select-text">
                    {formatFormula(col.parent)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SortableRootRow({
  item,
  open,
  toggleOpen,
  selected,
  onClick,
  rename,
  setUnit,
  setVarKey,
  linkCalc,
  toggleKind,
  duplicate,
  remove,
}: {
  item: KpiNode;
  open: boolean;
  toggleOpen(): void;
  selected: boolean;
  onClick(): void;
  rename(name: string): void;
  setUnit(unit: string): void;
  setVarKey(varKey: string): void;
  linkCalc(idOrNull: string | null): void;
  toggleKind(): void;
  duplicate(): void;
  remove(): void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div style={style} ref={setNodeRef} className="space-y-1">
      <div
        className={
          "flex items-center gap-2 border rounded-lg px-2 py-1 cursor-pointer " +
          (selected ? "bg-sky-50 border-sky-200" : "hover:bg-slate-50")
        }
        onClick={onClick}
      >
        {/* ドラッグハンドル */}
        <button
          className="cursor-grab px-1 text-xs text-gray-500 hover:text-gray-700"
          title="ドラッグで並べ替え"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          ⠿
        </button>

        <input
          className="bg-transparent px-1 text-sm w-full min-w-0"
          value={item.name}
          onChange={(e) => rename(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />

        <span
          className={
            "text-[10px] rounded px-1.5 py-0.5 shrink-0 " +
            (item.kind === "leaf" ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700")
          }
        >
          {item.kind}
        </span>

        {/* 詳細トグル */}
        <button
          className={"rounded px-1 text-xs hover:bg-white " + (open ? "font-semibold" : "")}
          title="詳細（単位・リンク）"
          onClick={(e) => {
            e.stopPropagation();
            toggleOpen();
          }}
        >
          ⚙
        </button>

        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button className="rounded px-1 text-xs hover:bg-white" title="leaf/calc 切替" onClick={(e) => { e.stopPropagation(); toggleKind(); }}>
            ⟳
          </button>
          <button className="rounded px-1 text-xs hover:bg-white" title="複製" onClick={(e) => { e.stopPropagation(); duplicate(); }}>
            ⧉
          </button>
          <button className="rounded px-1 text-xs hover:bg-white text-red-600" title="削除" onClick={(e) => { e.stopPropagation(); remove(); }}>
            ×
          </button>
        </div>
      </div>

      {/* ルート行の詳細パネル */}
      {open && (
        <div className="rounded-lg border bg-slate-50 px-2 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <UnitEditor value={item.unit} onChange={setUnit} />
            <LinkPicker
              roots={[]} // ルート列の LinkPicker は親から渡してもOKだが、ここでは入力共有(varKey)目的が主
              node={item}
              canLinkInput={item.kind === "leaf"}
              onSelectInput={setVarKey}
              onClearInput={() => setVarKey("")}
              onSelectCalc={(id) => linkCalc(id)}
              onClearLink={() => linkCalc(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
