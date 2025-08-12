// src/components/KpiBoard.tsx
"use client";
import { useMemo } from "react";
import KpiNode from "@/components/KpiNode";
import {
  createNode,
  formatFormula,
  cloneWithNewIds,
  type KpiNode as Node,
} from "@/types/kpi";

type Props = {
  roots: Node[];
  onChange(next: Node[]): void;
};

export default function KpiBoard({ roots, onChange }: Props) {
  const formulas = useMemo(() => roots.map(formatFormula), [roots]);

  const addRoot = (kind: "leaf" | "calc") => {
    const name = kind === "calc" ? "新しいKPI" : "概念ノード";
    onChange([...roots, createNode(name, kind)]);
  };

  const updateRoot = (i: number, node: Node) => {
    const next = [...roots];
    next[i] = node;
    onChange(next);
  };

  const removeRoot = (i: number) => {
    const next = roots.filter((_, idx) => idx !== i);
    onChange(next);
  };

  const moveRoot = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= roots.length) return;
    const next = [...roots];
    const [item] = next.splice(i, 1);
    next.splice(j, 0, item);
    onChange(next);
  };

  const duplicateRoot = (i: number) => {
    const next = [...roots];
    next.splice(i + 1, 0, cloneWithNewIds(roots[i]));
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {/* ツールバー */}
      <div className="flex items-center gap-2">
        <button
          className="rounded-md border px-3 py-1.5 hover:bg-gray-50"
          onClick={() => addRoot("calc")}
          title="演算ノードのルートを追加"
        >
          ＋ ルート（calc）
        </button>
        <button
          className="rounded-md border px-3 py-1.5 hover:bg-gray-50"
          onClick={() => addRoot("leaf")}
          title="概念ノードのルートを追加"
        >
          ＋ ルート（leaf）
        </button>

        <div className="ml-auto text-sm text-gray-600">
          ルート数：{roots.length}
        </div>
      </div>

      {/* ルート一覧 */}
      {roots.length === 0 ? (
        <div className="text-sm text-gray-500">
          まだルートがありません。「＋ ルート」から追加してください。
        </div>
      ) : (
        roots.map((root, i) => (
          <div key={root.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded bg-slate-100">ROOT {i + 1}</span>
              <span className="text-sm text-gray-600 truncate">
                {formatFormula(root)}
              </span>

              <div className="ml-auto flex items-center gap-1">
                <button
                  className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                  onClick={() => moveRoot(i, -1)}
                  disabled={i === 0}
                  title="上へ"
                >
                  ↑
                </button>
                <button
                  className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                  onClick={() => moveRoot(i, +1)}
                  disabled={i === roots.length - 1}
                  title="下へ"
                >
                  ↓
                </button>
                <button
                  className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                  onClick={() => duplicateRoot(i)}
                  title="複製"
                >
                  複製
                </button>
                <button
                  className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50 text-red-600"
                  onClick={() => removeRoot(i)}
                  title="削除"
                >
                  削除
                </button>
              </div>
            </div>

            {/* 各ルートの本体エディタ */}
            <KpiNode node={root} onChange={(n) => updateRoot(i, n)} />
          </div>
        ))
      )}

      {/* 全体の式一覧（上部ヘッダー以外にも置いておく） */}
      {roots.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-gray-500 mb-1">式の一覧</div>
          <ul className="text-sm list-disc pl-5 space-y-1">
            {formulas.map((f, idx) => (
              <li key={idx} className="truncate">{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
