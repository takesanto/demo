// src/components/CommandPalette.tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type Command = {
  id: string;
  label: string;
  section?: string; // 見出し（ファイル/表示/テンプレ…）
  keywords?: string; // 検索用
  run: () => void;
};

export default function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const list = useMemo(() => {
    const words = q
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const filtered = commands.filter((c) => {
      const hay = `${c.label} ${c.keywords ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    return filtered;
  }, [q, commands]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((i) => Math.min(i + 1, list.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        list[idx]?.run();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, list, idx, onClose]);

  if (!open) return null;

  // セクション表示用にグループ化
  const grouped = list.reduce<Record<string, Command[]>>((acc, c) => {
    const k = c.section ?? "";
    (acc[k] ??= []).push(c);
    return acc;
  }, {});

  const sections = Object.keys(grouped);

  return (
    <div className="fixed inset-0 z-50 bg-black/30 p-4" onClick={onClose}>
      <div
        className="mx-auto max-w-xl rounded-2xl border bg-white p-2 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          placeholder="コマンドを検索…（↑↓で移動、Enterで実行、Escで閉じる）"
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />

        <div className="mt-2 max-h-[50vh] overflow-auto">
          {sections.length === 0 ? (
            <div className="p-3 text-sm text-slate-500">見つかりません</div>
          ) : (
            sections.map((sec) => (
              <div key={sec} className="py-1">
                {sec && <div className="px-2 pb-1 text-[11px] text-slate-500">{sec}</div>}
                <ul className="space-y-1">
                  {grouped[sec].map((c, i) => {
                    // グローバル index を再計算
                    const flatIndex = list.indexOf(c);
                    const active = flatIndex === idx;
                    return (
                      <li key={c.id}>
                        <button
                          className={
                            "w-full rounded-lg px-3 py-2 text-left text-sm " +
                            (active ? "bg-sky-50 ring-1 ring-sky-200" : "hover:bg-slate-50")
                          }
                          onClick={() => {
                            c.run();
                            onClose();
                          }}
                        >
                          {c.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
