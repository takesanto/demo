// src/components/LinkPicker.tsx
"use client";
import { useMemo, useState } from "react";
import type { KpiNode } from "@/types/kpi";
import { enumerateLeaves, enumerateCalcs, leafGroupingKey } from "@/types/kpi";

type Props = {
  roots: KpiNode[];
  node: KpiNode;
  /** leaf のときだけ true。共有入力(varKey)へのリンクを表示 */
  canLinkInput?: boolean;
  /** 共有入力にリンク(= varKey を設定) */
  onSelectInput?: (varKey: string) => void;
  /** 計算結果(calc)を参照(link を設定) */
  onSelectCalc: (calcId: string) => void;
  /** 計算リンク解除 */
  onClearLink?: () => void;
  /** 入力リンク解除（varKey クリア） */
  onClearInput?: () => void;
};

export default function LinkPicker({
  roots,
  node,
  canLinkInput,
  onSelectInput,
  onSelectCalc,
  onClearLink,
  onClearInput,
}: Props) {
  const [q, setQ] = useState("");

  // 共有入力の候補（varKey 単位でユニーク化）
  const inputOpts = useMemo(() => {
    const map = new Map<string, { key: string; label: string; unit: string }>();
    enumerateLeaves(roots)
      .filter((lf) => lf.link?.type !== "calc") // 計算参照の leaf は入力ソースにしない
      .forEach((lf) => {
        const key = leafGroupingKey(lf);
        if (!map.has(key)) map.set(key, { key, label: lf.name, unit: lf.unit ?? "" });
      });
    return Array.from(map.values());
  }, [roots]);

  // 計算結果の候補（calc ノード）
  // - 自分自身は除外
  // - id で重複除去
  const calcOpts = useMemo(() => {
    const uniq = new Map<string, { id: string; label: string }>();
    enumerateCalcs(roots)
      .filter((c) => c.id !== node.id)
      .forEach((c) => {
        if (!uniq.has(c.id)) uniq.set(c.id, { id: c.id, label: c.name });
      });
    return Array.from(uniq.values());
  }, [roots, node.id]);

  const norm = (s: string) => s.toLowerCase();
  const qn = norm(q);

  const inputFiltered = useMemo(
    () => inputOpts.filter((o) => norm(o.label).includes(qn) || norm(o.unit).includes(qn)),
    [inputOpts, qn]
  );
  const calcFiltered = useMemo(
    () => calcOpts.filter((o) => norm(o.label).includes(qn)),
    [calcOpts, qn]
  );

  const close = (el: HTMLElement | null) => {
    const d = el?.closest("details") as HTMLDetailsElement | null;
    if (d) d.open = false;
  };

  return (
    <details className="relative inline-block">
      <summary
        className="list-none cursor-pointer select-none rounded border px-2 py-1 text-xs hover:bg-slate-50"
        title="既存にリンク / 計算結果を参照"
      >
        🔗
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-80 rounded-xl border bg-white p-2 shadow-lg">
        <input
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          placeholder="検索（名称/単位）"
          className="mb-2 w-full rounded border px-2 py-1 text-xs"
        />

        {canLinkInput && onSelectInput && (
          <>
            <div className="mb-1 text-[11px] text-slate-500">共有入力にリンク</div>
            <div className="max-h-40 overflow-auto space-y-1">
              {inputFiltered.length === 0 && (
                <div className="px-2 py-2 text-xs text-slate-400">候補なし</div>
              )}
              {inputFiltered.map((o) => (
                <button
                  key={`input-${o.key}`} // ← key にプレフィックス
                  className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-50"
                  onClick={(e) => {
                    onSelectInput(o.key);
                    close(e.currentTarget);
                  }}
                  title={o.unit ? `${o.label} (${o.unit})` : o.label}
                >
                  {o.label} {o.unit && <span className="text-slate-400">({o.unit})</span>}
                </button>
              ))}
            </div>
            <hr className="my-2" />
          </>
        )}

        <div className="mb-1 text-[11px] text-slate-500">計算結果を参照</div>
        <div className="max-h-48 overflow-auto space-y-1">
          {calcFiltered.length === 0 && (
            <div className="px-2 py-2 text-xs text-slate-400">候補なし</div>
          )}
          {calcFiltered.map((o) => (
            <button
              key={`calc-${o.id}`} // ← key にプレフィックス
              className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-50"
              onClick={(e) => {
                onSelectCalc(o.id);
                close(e.currentTarget);
              }}
              title={o.label}
            >
              {o.label}
            </button>
          ))}
        </div>

        {(onClearInput || onClearLink) && <hr className="my-2" />}
        <div className="flex gap-2">
          {onClearInput && (
            <button
              className="rounded border px-2 py-1 text-xs hover:bg-slate-50"
              onClick={(e) => {
                onClearInput();
                close(e.currentTarget);
              }}
            >
              入力リンク解除
            </button>
          )}
          {onClearLink && (
            <button
              className="rounded border px-2 py-1 text-xs hover:bg-slate-50"
              onClick={(e) => {
                onClearLink();
                close(e.currentTarget);
              }}
            >
              計算リンク解除
            </button>
          )}
        </div>
      </div>
    </details>
  );
}
