// src/app/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";

import AppMenubar from "@/components/AppMenubar";
import CommandPalette, { type Command } from "@/components/CommandPalette";
import KpiTabs from "@/components/KpiTabs";
import KpiColumns from "@/components/KpiColumns";
import KpiOverview from "@/components/KpiOverview";

import {
  createNode,
  createGroup,
  cloneGroup,
  type KpiGroup,
  type KpiNode as Node,
  formatFormula,
} from "@/types/kpi";

import { exportIPOXlsx, exportIPOXlsxPeriods } from "@/utils/excel";
import { TEMPLATES, type GroupTemplate } from "@/templates/presets";

type ViewMode = "columns" | "overview";
type SnapshotV1 = {
  schema: "kpi@1";
  version: 1;
  groups: KpiGroup[];
  active: number;
};

const STORAGE_KEY = "kpi-tree-v1";

export default function Page() {
  // ------------------------------------------------------------
  // マウント検知：SSR では重い UI を描画しない（Hydration 差異を防止）
  // ------------------------------------------------------------
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);

  // ------------------------------------------------------------
  // State（初期は空にして、マウント後に LocalStorage or デフォルトを投入）
  // ------------------------------------------------------------
  const [groups, setGroups] = useState<KpiGroup[]>([]);
  const [active, setActive] = useState(0);
  const [view, setView] = useState<ViewMode>("columns");
  const [selectionFormula, setSelectionFormula] = useState<string | null>(null);

  // 初回ロード：localStorage → なければデフォルトのグループを投入
  useEffect(() => {
    if (!hasMounted) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const snap = JSON.parse(raw) as SnapshotV1;
        if (snap?.schema === "kpi@1") {
          setGroups(snap.groups);
          setActive(Math.min(Math.max(0, snap.active ?? 0), Math.max(0, snap.groups.length - 1)));
          return;
        }
      }
    } catch {
      // fall through
    }
    // ここまで来たらデフォルト
    const g = createGroup("売上KPI", [createNode("売上", "calc")]);
    setGroups([g]);
    setActive(0);
  }, [hasMounted]);

  // 自動保存
  useEffect(() => {
    if (!hasMounted) return;
    const snap: SnapshotV1 = { schema: "kpi@1", version: 1, groups, active };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch {}
  }, [groups, active, hasMounted]);

  // ------------------------------------------------------------
  // Excel 出力
  // ------------------------------------------------------------
  const exportExcelIPO = () => {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    exportIPOXlsx(groups, `kpi-model-${ts}.xlsx`);
  };

  const exportExcelIPOWithPeriods = () => {
    const ym = window.prompt("開始年月 (YYYY-MM)", "2025-01") || "2025-01";
    const n = parseInt(window.prompt("期間（月数）", "12") || "12", 10);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    exportIPOXlsxPeriods(groups, `kpi-model-periods-${ts}.xlsx`, {
      startYM: ym,
      periods: Number.isFinite(n) && n > 0 ? n : 12,
    });
  };

  // ------------------------------------------------------------
  // テンプレート
  // ------------------------------------------------------------
  const [tplId, setTplId] = useState<string>(TEMPLATES[0]?.id ?? "");
  const pickTpl = (): GroupTemplate => TEMPLATES.find((t) => t.id === tplId) ?? TEMPLATES[0];

  // ------------------------------------------------------------
  // ファイル入力（JSON）
  // ------------------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerJsonImport = () => fileInputRef.current?.click();

  // ------------------------------------------------------------
  // ⌘K：コマンドパレット
  // ------------------------------------------------------------
  const [cmdOpen, setCmdOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ------------------------------------------------------------
  // ヘッダ文言
  // ------------------------------------------------------------
  const activeGroup = groups[active];
  const headerText = useMemo(() => {
    if (!activeGroup) return "KPI ロジックツリー";
    if (view === "columns" && selectionFormula) return selectionFormula;
    const roots = activeGroup.roots;
    if (roots.length === 0) return `${activeGroup.name}（空）`;
    if (roots.length === 1) return formatFormula(roots[0]);
    return `${activeGroup.name}：${roots.length} 個のKPI`;
  }, [activeGroup, view, selectionFormula]);

  // ------------------------------------------------------------
  // グループ操作
  // ------------------------------------------------------------
  const addGroup = () => {
    const next = [...groups, createGroup("新しいグループ")];
    setGroups(next);
    setActive(next.length - 1);
    setSelectionFormula(null);
  };
  const renameGroup = (i: number, name: string) => {
    const next = [...groups];
    next[i] = { ...next[i], name };
    setGroups(next);
  };
  const removeGroup = (i: number) => {
    const next = groups.filter((_, idx) => idx !== i);
    setGroups(next);
    if (next.length === 0) {
      setActive(0);
      setSelectionFormula(null);
    } else if (i <= active) {
      setActive(Math.max(0, active - 1));
      setSelectionFormula(null);
    }
  };
  const moveGroup = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= groups.length) return;
    const next = arrayMove(groups, i, j);
    setGroups(next);
    if (active === i) setActive(j);
    else if (active === j) setActive(i);
  };
  const duplicateGroup = (i: number) => {
    const next = [...groups];
    next.splice(i + 1, 0, cloneGroup(groups[i]));
    setGroups(next);
    setActive(i + 1);
    setSelectionFormula(null);
  };
  const reorderGroups = (from: number, to: number) => {
    const selectedId = groups[active]?.id;
    const next = arrayMove(groups, from, to);
    setGroups(next);
    const newActive = next.findIndex((g) => g.id === selectedId);
    setActive(newActive >= 0 ? newActive : 0);
  };
  const updateRoots = (nextRoots: Node[]) => {
    if (!groups[active]) return;
    const next = [...groups];
    next[active] = { ...next[active], roots: nextRoots };
    setGroups(next);
  };

  // ------------------------------------------------------------
  // JSON 入出力
  // ------------------------------------------------------------
  const exportJson = () => {
    const snap: SnapshotV1 = { schema: "kpi@1", version: 1, groups, active };
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `kpi-tree-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const text = await file.text();
      const snap = JSON.parse(text) as SnapshotV1;
      if (snap?.schema !== "kpi@1" || !Array.isArray(snap.groups)) {
        alert("JSONの形式が不正です。");
        return;
      }
      setGroups(snap.groups);
      setActive(Math.min(Math.max(0, snap.active ?? 0), snap.groups.length - 1));
      setSelectionFormula(null);
    } catch {
      alert("読み込みに失敗しました。");
    }
  };

  const saveLocal = () => {
    try {
      const snap: SnapshotV1 = { schema: "kpi@1", version: 1, groups, active };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
      alert("ローカルに保存しました。");
    } catch {
      alert("保存に失敗しました。");
    }
  };
  const loadLocal = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return alert("ローカルに保存が見つかりません。");
      const snap = JSON.parse(raw) as SnapshotV1;
      if (snap?.schema !== "kpi@1") return alert("保存データの形式が不正です。");
      setGroups(snap.groups);
      setActive(Math.min(Math.max(0, snap.active ?? 0), snap.groups.length - 1));
      setSelectionFormula(null);
    } catch {
      alert("読み込みに失敗しました。");
    }
  };
  const clearLocal = () => {
    localStorage.removeItem(STORAGE_KEY);
    alert("ローカル保存を削除しました。");
  };

  // ------------------------------------------------------------
  // テンプレ適用
  // ------------------------------------------------------------
  const addTemplateAsNewGroup = () => {
    const g = pickTpl().build();
    const next = [...groups, g];
    setGroups(next);
    setActive(next.length - 1);
    setView("overview");
    setSelectionFormula(null);
  };
  const replaceActiveWithTemplate = () => {
    if (!groups[active]) return addTemplateAsNewGroup();
    const g = pickTpl().build();
    const next = [...groups];
    next[active] = { ...next[active], roots: g.roots };
    setGroups(next);
    setView("overview");
    setSelectionFormula(null);
  };
  const appendTemplateToActive = () => {
    if (!groups[active]) return addTemplateAsNewGroup();
    const g = pickTpl().build();
    const next = [...groups];
    next[active] = { ...next[active], roots: [...next[active].roots, ...g.roots] };
    setGroups(next);
    setView("overview");
    setSelectionFormula(null);
  };

  // ------------------------------------------------------------
  // コマンドパレット
  // ------------------------------------------------------------
  const commands: Command[] = [
    { id: "save", section: "ファイル", label: "保存（ローカル）", run: saveLocal },
    { id: "load", section: "ファイル", label: "読み込み（ローカル）", run: loadLocal },
    { id: "export", section: "ファイル", label: "書き出し（JSON ダウンロード）", run: exportJson },
    { id: "import", section: "ファイル", label: "読み込み（JSON ファイル）", run: triggerJsonImport },

    { id: "view-columns", section: "表示", label: "編集（カラム）に切替", run: () => setView("columns") },
    { id: "view-overview", section: "表示", label: "俯瞰（縦）に切替", run: () => setView("overview") },

    { id: "grp-new", section: "グループ", label: "新規グループを追加", run: addGroup },
    { id: "grp-dup", section: "グループ", label: "アクティブグループを複製", run: () => duplicateGroup(active) },
    { id: "grp-del", section: "グループ", label: "アクティブグループを削除", run: () => removeGroup(active) },

    { id: "tpl-new", section: "テンプレート", label: `新規グループで追加（${TEMPLATES.find(t => t.id === tplId)?.name ?? ""}）`, run: addTemplateAsNewGroup },
    { id: "tpl-replace", section: "テンプレート", label: `現在のグループを置換（${TEMPLATES.find(t => t.id === tplId)?.name ?? ""}）`, run: replaceActiveWithTemplate },
    { id: "tpl-append", section: "テンプレート", label: `このグループへ追加（${TEMPLATES.find(t => t.id === tplId)?.name ?? ""}）`, run: appendTemplateToActive },
  ];

  // ------------------------------------------------------------
  // Render
  // ------------------------------------------------------------
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-6xl px-4 py-3 space-y-3">
          {/* 上段：タイトル + 式 + ⌘K */}
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-lg font-semibold tracking-tight">KPI ロジックツリー</h1>
            <div className="flex items-center gap-2">
              <div className="text-sm text-gray-600 truncate max-w-[48ch]">{headerText}</div>
              <button
                className="rounded-md border px-2 py-1 text-xs hover:bg-slate-50"
                onClick={() => setCmdOpen(true)}
                title="コマンドパレット（⌘/Ctrl + K）"
              >
                ⌘K
              </button>
            </div>
          </div>

          {/* 中段：メニューバー */}
          <AppMenubar
            templates={TEMPLATES}
            tplId={tplId}
            setTplId={setTplId}
            onTplNewGroup={addTemplateAsNewGroup}
            onTplReplace={replaceActiveWithTemplate}
            onTplAppend={appendTemplateToActive}
            view={view}
            setView={setView}
            onSaveLocal={saveLocal}
            onLoadLocal={loadLocal}
            onExportJson={exportJson}
            onImportJsonClick={triggerJsonImport}
            onClearLocal={clearLocal}
            onNewGroup={addGroup}
            onDuplicateGroup={() => duplicateGroup(active)}
            onRemoveGroup={() => removeGroup(active)}
            onExportExcel={exportExcelIPO}
            onExportExcelPeriods={exportExcelIPOWithPeriods}
          />

          {/* タブ（ドラッグで並べ替え可） */}
          {hasMounted ? (
            <KpiTabs
              groups={groups}
              active={active}
              onSelect={(i) => {
                setActive(i);
                setSelectionFormula(null);
              }}
              onAdd={addGroup}
              onRename={renameGroup}
              onRemove={removeGroup}
              onMove={moveGroup}
              onDuplicate={duplicateGroup}
              onReorder={reorderGroups}
            />
          ) : (
            <div className="h-10" />
          )}
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {!activeGroup ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm text-sm text-gray-500">
            グループがありません。メニュー「グループ」または「テンプレート」から追加してください。
          </div>
        ) : view === "columns" ? (
          hasMounted ? (
            <KpiColumns
              roots={activeGroup.roots}
              onChange={updateRoots}
              groupName={activeGroup.name}
              onSelectionChange={(_, node) => {
                if (!node) return setSelectionFormula(null);
                if (node.kind === "calc" && node.children.length > 0) {
                  setSelectionFormula(formatFormula(node));
                } else {
                  setSelectionFormula(node.name);
                }
              }}
            />
          ) : (
            <div className="bg-white rounded-2xl p-6 shadow-sm text-sm text-gray-400">読み込み中…</div>
          )
        ) : hasMounted ? (
          <KpiOverview roots={activeGroup.roots} onChange={updateRoots} />
        ) : (
          <div className="bg-white rounded-2xl p-6 shadow-sm text-sm text-gray-400">読み込み中…</div>
        )}

        <details className="bg-white rounded-2xl p-4 shadow-sm group" open={false}>
          <summary className="cursor-pointer list-none font-medium flex items-center justify-between">
            構造プレビュー（JSON）
            <span className="text-xs text-gray-500 group-open:hidden">▼ 開く</span>
            <span className="text-xs text-gray-500 hidden group-open:inline">▲ 閉じる</span>
          </summary>
          {/* サーバとクライアントで内容が違っても警告しない */}
          <pre className="mt-3 text-xs bg-slate-50 p-3 rounded overflow-auto" suppressHydrationWarning>
            {JSON.stringify(groups, null, 2)}
          </pre>
        </details>
      </section>

      {/* 隠しファイル入力（JSONインポート） */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) importJson(file);
          e.currentTarget.value = "";
        }}
      />

      {/* コマンドパレット */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} commands={commands} />
    </main>
  );
}
