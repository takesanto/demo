// src/components/KpiNode.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import type { KpiNode, Operator } from "@/types/kpi";
import {
  createNode,
  appendChild,
  removeChildAt,
  setOpAt,
  moveChild,
  formatFormula,
} from "@/types/kpi";

type Props = {
  node: KpiNode;
  onChange(node: KpiNode): void;
};

const opSymbols: Record<Operator, string> = { "+": "＋", "-": "−", "*": "×", "/": "÷" };

export default function KpiNode({ node, onChange }: Props) {
  const [local, setLocal] = useState(node);
  const [collapsed, setCollapsed] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null); // 子チップのリネーム用

  useEffect(() => setLocal(node), [node]);

  const sync = (next: KpiNode) => {
    setLocal(next);
    onChange(next);
  };

  const setName = (name: string) => sync({ ...local, name });
  const setKind = (kind: "leaf" | "calc") => {
    let next = { ...local, kind };
    if (kind === "calc") {
      const need = Math.max(0, next.children.length - 1);
      next.ops = Array.from({ length: need }, (_, i) => next.ops?.[i] ?? "*");
    } else {
      next.ops = [];
    }
    sync(next);
  };

  const addChildLeaf = () => {
    let next = local.kind === "calc" ? local : { ...local, kind: "calc" };
    next = appendChild(next, createNode("子ノード", "leaf"));
    sync(next);
  };
  const addChildCalc = () => {
    let next = local.kind === "calc" ? local : { ...local, kind: "calc" };
    next = appendChild(next, createNode("子ノード", "calc"));
    sync(next);
  };

  const updateChild = (i: number, child: KpiNode) => {
    const next = { ...local };
    next.children[i] = child;
    sync(next);
  };

  const renameChild = (i: number, name: string) => {
    const next = { ...local };
    next.children[i] = { ...next.children[i], name };
    sync(next);
  };

  const removeChild = (i: number) => sync(removeChildAt(local, i));
  const moveUp = (i: number) => i > 0 && sync(moveChild(local, i, i - 1));
  const moveDown = (i: number) =>
    i < local.children.length - 1 && sync(moveChild(local, i, i + 1));

  const setOp = (i: number, op: Operator) => sync(setOpAt(local, i, op));

  const formula = useMemo(() => formatFormula(local), [local]);

  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-white">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="mr-1 rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
          onClick={() => setCollapsed((v) => !v)}
          aria-label="折りたたみ"
          title="折りたたみ"
        >
          {collapsed ? "▶" : "▼"}
        </button>

        <input
          className="border rounded px-3 py-1.5 w-56 font-medium"
          value={local.name}
          onChange={(e) => setName(e.target.value)}
          aria-label="ノード名"
        />

        <div className="ml-2 inline-flex rounded-md border bg-slate-50 p-0.5">
          <button
            className={
              "px-3 py-1.5 text-xs rounded-md " +
              (local.kind === "leaf" ? "bg-white shadow" : "hover:bg-white/60")
            }
            onClick={() => setKind("leaf")}
            title="末端ノード（値は持たない概念）"
          >
            leaf
          </button>
          <button
            className={
              "px-3 py-1.5 text-xs rounded-md " +
              (local.kind === "calc" ? "bg-white shadow" : "hover:bg:white/60 hover:bg-white/60")
            }
            onClick={() => setKind("calc")}
            title="子ノード同士を演算で結ぶ"
          >
            calc
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
            onClick={addChildLeaf}
          >
            ＋ Leaf
          </button>
          <button
            className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
            onClick={addChildCalc}
          >
            ＋ Calc
          </button>
        </div>
      </div>

      {/* 式ビルダー */}
      {local.kind === "calc" && (
        <div className="mt-3 space-y-2">
          {local.children.length === 0 ? (
            <div className="text-xs text-gray-500">
              まず「＋ Leaf / ＋ Calc」で子を追加してください。
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {local.children.map((c, idx) => (
                <div key={c.id} className="flex items-center gap-2">
                  {/* 子の“チップ” */}
                  <div className="flex items-center gap-1 rounded-full border bg-slate-50 pl-2 pr-1 py-1">
                    {editingIdx === idx ? (
                      <input
                        className="bg-white border rounded px-2 py-0.5 text-sm"
                        value={c.name}
                        onChange={(e) => renameChild(idx, e.target.value)}
                        onBlur={() => setEditingIdx(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") setEditingIdx(null);
                        }}
                        autoFocus
                        aria-label="子ノード名"
                        style={{ width: Math.max(40, c.name.length * 12) }}
                      />
                    ) : (
                      <button
                        className="text-sm"
                        title="クリックで名前を編集"
                        onClick={() => setEditingIdx(idx)}
                      >
                        {c.name}
                      </button>
                    )}
                    <span
                      className={
                        "text-[10px] rounded px-1.5 py-0.5 " +
                        (c.kind === "leaf"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-indigo-100 text-indigo-700")
                      }
                      title={c.kind === "leaf" ? "leaf（末端）" : "calc（演算ノード）"}
                    >
                      {c.kind}
                    </span>

                    {/* 並べ替え / 削除 */}
                    <div className="flex items-center">
                      <button
                        className="ml-1 rounded px-1 text-xs hover:bg-white"
                        onClick={() => moveUp(idx)}
                        title="上へ"
                        aria-label="上へ"
                        disabled={idx === 0}
                      >
                        ↑
                      </button>
                      <button
                        className="rounded px-1 text-xs hover:bg-white"
                        onClick={() => moveDown(idx)}
                        title="下へ"
                        aria-label="下へ"
                        disabled={idx === local.children.length - 1}
                      >
                        ↓
                      </button>
                      <button
                        className="rounded px-1 text-xs hover:bg-white text-red-600"
                        onClick={() => removeChild(idx)}
                        title="削除"
                        aria-label="削除"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* 子と子の間の演算子（セグメントボタン） */}
                  {idx < local.children.length - 1 && (
                    <div className="inline-flex rounded-md border bg-slate-50 p-0.5">
                      {(["+", "-", "*", "/"] as Operator[]).map((op) => (
                        <button
                          key={op}
                          className={
                            "px-2 py-1 text-sm rounded-md " +
                            ((local.ops?.[idx] ?? "*") === op
                              ? "bg-white shadow font-semibold"
                              : "hover:bg-white/70")
                          }
                          onClick={() => setOp(idx, op)}
                          title={`演算子 ${opSymbols[op]}`}
                          aria-label={`演算子 ${opSymbols[op]}`}
                        >
                          {opSymbols[op]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* このノードの式プレビュー */}
          <div className="text-xs bg-slate-50 p-2 rounded select-text">
            {formula}
          </div>
        </div>
      )}

      {/* 折りたたみ可能な子ノード領域（再帰） */}
      {!collapsed && local.children.length > 0 && (
        <div className="mt-3 pl-5 border-l space-y-3">
          {local.children.map((child, i) => (
            <KpiNode key={child.id} node={child} onChange={(n) => updateChild(i, n)} />
          ))}
        </div>
      )}
    </div>
  );
}
