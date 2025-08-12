// src/components/KpiOverview.tsx
"use client";
import { useState } from "react";
import UnitEditor from "@/components/UnitEditor";
import type { Operator, NodePath } from "@/types/kpi";
import LinkPicker from "@/components/LinkPicker";
import {
  createNode,
  appendChild,
  removeChildAt,
  setOpAt,
  moveChild,
  updateNodeByPath,
  tokenizeFormula,
  type KpiNode as Node,
} from "@/types/kpi";

type Props = {
  roots: Node[];
  onChange(next: Node[]): void;
};

export default function KpiOverview({ roots, onChange }: Props) {
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const jumpTo = (id: string) => {
    setHighlightId(id);
    const el = document.querySelector<HTMLElement>(`[data-node-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => setHighlightId(null), 1200);
    }
  };

  return (
    <div className="space-y-4">
      {/* === 式の図解バー === */}
      <FormulaPanel roots={roots} onJump={jumpTo} />

      {/* === ツリー本体（縦に全展開） === */}
      {roots.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm text-sm text-gray-500">
          ルートがありません。上のツールバーから追加してください。
        </div>
      ) : (
        roots.map((r) => (
          <TreeNode
            key={r.id}
            node={r}
            path={[r.id]}
            depth={0}
            roots={roots}
            onChange={onChange}
            highlightId={highlightId}
          />
        ))
      )}
    </div>
  );
}

/* ---------- 式の図解パネル ---------- */

function FormulaPanel({ roots, onJump }: { roots: Node[]; onJump: (id: string) => void }) {
  if (roots.length === 0) return null;
  const sym: Record<Operator, string> = { "+": "＋", "-": "−", "*": "×", "/": "÷" };

  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm space-y-2">
      <div className="text-sm text-gray-500">式の図解</div>
      {roots.map((root) => {
        const tokens = tokenizeFormula(root);
        return (
          <div
            key={root.id}
            className="flex items-center gap-1 overflow-x-auto whitespace-nowrap px-1"
            title="クリックすると該当ノードにスクロールします"
          >
            {tokens.map((t, i) => {
              if (t.kind === "node") {
                return (
                  <button
                    key={i}
                    className="rounded-full border bg-slate-50 px-2 py-0.5 text-sm hover:bg-white"
                    onClick={() => onJump(t.id)}
                  >
                    {t.name}
                  </button>
                );
              }
              if (t.kind === "op") {
                return (
                  <span key={i} className="px-1 text-sm">
                    {sym[t.op]}
                  </span>
                );
              }
              if (t.kind === "paren") {
                return (
                  <span key={i} className="px-0.5 text-gray-400">
                    {t.dir}
                  </span>
                );
              }
              // eq
              return (
                <span key={i} className="px-2">
                  ＝
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- ツリー（縦展開） ---------- */

function TreeNode({
  node,
  path,
  depth,
  roots,
  onChange,
  highlightId,
}: {
  node: Node;
  path: NodePath;
  depth: number;
  roots: Node[];
  onChange(next: Node[]): void;
  highlightId: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const isHighlight = highlightId === node.id;

  const setName = (name: string) =>
    onChange(updateNodeByPath(roots, path, (n) => ({ ...n, name })));

  const setUnit = (unit: string) =>
    onChange(updateNodeByPath(roots, path, (n) => ({ ...n, unit })));

  const setKind = (kind: "leaf" | "calc") =>
    onChange(
      updateNodeByPath(roots, path, (n) => {
        if (kind === "calc") {
          const need = Math.max(0, n.children.length - 1);
          const ops = Array.from({ length: need }, (_, i) => n.ops?.[i] ?? "*");
          return { ...n, kind, ops };
        }
        return { ...n, kind, ops: [] };
      })
    );

  const addChild = (childKind: "leaf" | "calc") =>
    onChange(
      updateNodeByPath(roots, path, (n) =>
        appendChild(n.kind === "calc" ? n : { ...n, kind: "calc" }, createNode("子ノード", childKind))
      )
    );

  const renameChild = (idx: number, name: string) =>
    onChange(
      updateNodeByPath(roots, path, (p) => {
        const children = [...p.children];
        children[idx] = { ...children[idx], name };
        return { ...p, children };
      })
    );

  const setChildUnit = (idx: number, unit: string) =>
    onChange(
      updateNodeByPath(roots, path, (p) => {
        const children = [...p.children];
        children[idx] = { ...children[idx], unit };
        return { ...p, children };
      })
    );

  const toggleChildKind = (idx: number) =>
    onChange(
      updateNodeByPath(roots, path, (p) => {
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

  const setVarKey = (varKey: string) =>
    onChange(updateNodeByPath(roots, path, (n) => ({ ...n, varKey })));

  const setLinkCalc = (calcId: string | null) =>
    onChange(updateNodeByPath(roots, path, (n) => ({ ...n, link: calcId ? { type: "calc", key: calcId } : undefined })));

  const setChildVarKey = (idx: number, varKey: string) =>
    onChange(updateNodeByPath(roots, path, (p) => {
      const cs = [...p.children];
      cs[idx] = { ...cs[idx], varKey };
      return { ...p, children: cs };
    }));

  const setChildLinkCalc = (idx: number, calcId: string | null) =>
    onChange(updateNodeByPath(roots, path, (p) => {
      const cs = [...p.children];
      cs[idx] = { ...cs[idx], link: calcId ? { type: "calc", key: calcId } : undefined };
      return { ...p, children: cs };
    }));

  const removeChild = (idx: number) => onChange(updateNodeByPath(roots, path, (p) => removeChildAt(p, idx)));
  const moveUp = (idx: number) => idx > 0 && onChange(updateNodeByPath(roots, path, (p) => moveChild(p, idx, idx - 1)));
  const moveDown = (idx: number) => onChange(updateNodeByPath(roots, path, (p) => moveChild(p, idx, idx + 1)));
  const setOp = (idx: number, op: Operator) => onChange(updateNodeByPath(roots, path, (p) => setOpAt(p, idx, op)));

  return (
    <div
      data-node-id={node.id}
      className={
        "bg-white rounded-2xl p-4 shadow-sm scroll-mt-28 " +
        (isHighlight ? "ring-2 ring-sky-300 transition" : "")
      }
    >
      {/* ノードヘッダー：名前 + 単位 + 種別 + 子追加 */}
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <input
            className="border rounded px-3 py-1.5 w-[320px] font-medium"
            defaultValue={node.name}
            onBlur={(e) => {
              setName(e.currentTarget.value.trim() || node.name);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
          />
        ) : (
          <div
            className="px-3 py-1.5 rounded-lg border font-medium cursor-text hover:bg-slate-50"
            onClick={() => setEditing(true)}
            title="クリックして名前を編集"
          >
            {node.name}
          </div>
        )}

        {/* ★ 単位エディタ（常時表示） */}
        <UnitEditor value={node.unit} onChange={setUnit} />
        <LinkPicker
          roots={roots}
          node={node}
          canLinkInput={node.kind === "leaf"}
          onSelectInput={(k) => setVarKey(k)}
          onClearInput={() => setVarKey("")}
          onSelectCalc={(id) => setLinkCalc(id)}
          onClearLink={() => setLinkCalc(null)}
        />
        <div className="inline-flex rounded-md border bg-slate-50 p-0.5">
          <button
            className={"px-3 py-1.5 text-xs rounded-md " + (node.kind === "leaf" ? "bg-white shadow" : "hover:bg-white/60")}
            onClick={() => setKind("leaf")}
          >
            leaf
          </button>
          <button
            className={"px-3 py-1.5 text-xs rounded-md " + (node.kind === "calc" ? "bg-white shadow" : "hover:bg-white/60")}
            onClick={() => setKind("calc")}
          >
            calc
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50" onClick={() => addChild("leaf")}>
            ＋ Leaf
          </button>
          <button className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50" onClick={() => addChild("calc")}>
            ＋ Calc
          </button>
        </div>
      </div>

      {/* 子の式行（calc の時だけ） */}
      {node.kind === "calc" && (
        <div className="mt-3 space-y-2">
          {node.children.length === 0 ? (
            <div className="text-xs text-gray-500">まず「＋」で子を追加してください。</div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {node.children.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2">
                  {/* 子ノードのチップ（編集/操作込み） */}
                  <div className="flex items-center gap-1 rounded-full border bg-slate-50 pl-2 pr-1 py-1">
                    <input
                      className="bg-transparent px-1 text-sm w-[12ch]"
                      value={c.name}
                      onChange={(e) => renameChild(i, e.target.value)}
                      aria-label="子ノード名"
                    />
                    {/* ★ 子ノードの単位 */}
                    <UnitEditor value={c.unit} onChange={(u) => setChildUnit(i, u)} />
                    <LinkPicker
                      roots={roots}
                      node={c}
                      canLinkInput={c.kind === "leaf"}
                      onSelectInput={(k) => setChildVarKey(i, k)}
                      onClearInput={() => setChildVarKey(i, "")}
                      onSelectCalc={(id) => setChildLinkCalc(i, id)}
                      onClearLink={() => setChildLinkCalc(i, null)}
                    />
                    <span
                      className={
                        "text-[10px] rounded px-1.5 py-0.5 " +
                        (c.kind === "leaf" ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700")
                      }
                    >
                      {c.kind}
                    </span>
                    <div className="flex items-center">
                      <button className="ml-1 rounded px-1 text-xs hover:bg-white" onClick={() => toggleChildKind(i)} title="leaf/calc 切替">
                        ⟳
                      </button>
                      <button className="rounded px-1 text-xs hover:bg-white" onClick={() => moveUp(i)} title="上へ" disabled={i === 0}>
                        ↑
                      </button>
                      <button
                        className="rounded px-1 text-xs hover:bg-white"
                        onClick={() => moveDown(i)}
                        title="下へ"
                        disabled={i === node.children.length - 1}
                      >
                        ↓
                      </button>
                      <button className="rounded px-1 text-xs hover:bg-white text-red-600" onClick={() => removeChild(i)} title="削除">
                        ×
                      </button>
                    </div>
                  </div>

                  {/* 子と子の間の演算子 */}
                  {i < node.children.length - 1 && (
                    <div className="inline-flex rounded-md border bg-slate-50 p-0.5">
                      {(["+", "-", "*", "/"] as Operator[]).map((op) => (
                        <button
                          key={op}
                          className={
                            "px-2 py-1 text-sm rounded-md " +
                            ((node.ops?.[i] ?? "*") === op ? "bg-white shadow font-semibold" : "hover:bg-white/70")
                          }
                          onClick={() => setOp(i, op)}
                          title={`演算子 ${op}`}
                          aria-label={`演算子 ${op}`}
                        >
                          {op === "+" ? "＋" : op === "-" ? "−" : op === "*" ? "×" : "÷"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 子ノードたち（再帰・縦展開） */}
      {node.children.length > 0 && (
        <div className="mt-3 pl-5 border-l space-y-3">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              path={[...path, child.id]}
              depth={depth + 1}
              roots={roots}
              onChange={onChange}
              highlightId={highlightId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
