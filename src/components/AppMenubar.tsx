// src/components/AppMenubar.tsx
"use client";

import { useMemo, useState } from "react";
import type { GroupTemplate } from "@/templates/presets";

type ViewMode = "columns" | "overview";

// 期間指定のために使う引数型
export type ExcelPeriodsArgs = {
  startYM: string;   // "YYYY-MM"
  periods: number;   // 列数（月数）
};

type Props = {
  // テンプレ
  templates: GroupTemplate[];
  tplId: string;
  setTplId: (id: string) => void;
  onTplNewGroup: () => void;
  onTplReplace: () => void;
  onTplAppend: () => void;

  // 表示モード
  view: ViewMode;
  setView: (v: ViewMode) => void;

  // ファイル操作
  onSaveLocal: () => void;
  onLoadLocal: () => void;
  onExportJson: () => void;
  onImportJsonClick: () => void; // 隠し <input type="file"> を開く
  onClearLocal: () => void;

  // Excel 出力
  onExportExcel: () => void; // 単列の従来版（残しておきます）
  onExportExcelPeriods?: (args: ExcelPeriodsArgs) => void; // ★ 期間指定版（任意）

  // グループ操作（アクティブに対して）
  onNewGroup: () => void;
  onDuplicateGroup: () => void;
  onRemoveGroup: () => void;
};

export default function AppMenubar({
  templates,
  tplId,
  setTplId,
  onTplNewGroup,
  onTplReplace,
  onTplAppend,
  view,
  setView,
  onSaveLocal,
  onLoadLocal,
  onExportJson,
  onImportJsonClick,
  onClearLocal,
  onNewGroup,
  onDuplicateGroup,
  onRemoveGroup,
  onExportExcel,
  onExportExcelPeriods,
}: Props) {
  // 期間指定用のローカル状態（デフォルトは当月と12ヶ月）
  const ymDefault = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, []);
  const [startYM, setStartYM] = useState<string>(ymDefault);
  const [months, setMonths] = useState<number>(12);

  const runExportPeriods = () => {
    if (!onExportExcelPeriods) return;
    const ym = /^\d{4}-\d{2}$/.test(startYM) ? startYM : ymDefault;
    const n = Number.isFinite(months) && months > 0 ? months : 12;
    onExportExcelPeriods({ startYM: ym, periods: n });
  };

  return (
    <nav className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-1 shadow-sm">
      <Menu label="ファイル">
        <MenuItem onClick={onSaveLocal}>💾 保存</MenuItem>
        <MenuItem onClick={onLoadLocal}>📂 読み込み（ローカル）</MenuItem>
        <MenuItem onClick={onExportJson}>⬇︎ 書き出し（JSON）</MenuItem>
        <MenuItem onClick={onImportJsonClick}>⬆︎ 読み込み（JSON）</MenuItem>

        {/* ★ 期間指定の Excel 書き出し（対応しているときだけ表示） */}
        {onExportExcelPeriods && (
          <div className="mx-1 my-2 rounded-lg border bg-slate-50 p-2">
            <div className="mb-1 text-xs text-slate-600">📊 Excel（IPO・期間）</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 text-xs">
                <span className="w-20 text-right">開始年月</span>
                <input
                  type="month"
                  value={startYM}
                  onChange={(e) => setStartYM(e.currentTarget.value)}
                  className="w-full rounded border px-2 py-1 text-xs"
                />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <span className="w-20 text-right">期間（月）</span>
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={months}
                  onChange={(e) => setMonths(parseInt(e.currentTarget.value || "0", 10))}
                  className="w-full rounded border px-2 py-1 text-xs"
                />
              </label>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button onClick={runExportPeriods}>期間で書き出し</Button>
              {/* 旧仕様（単列）も残す */}
              <Button onClick={onExportExcel}>従来版で書き出し</Button>
            </div>
          </div>
        )}

        {/* 期間版を使わない場合は従来ボタンだけ出す */}
        {!onExportExcelPeriods && (
          <MenuItem onClick={onExportExcel}>📊 Excel（IPO）書き出し</MenuItem>
        )}

        <hr className="my-2 border-slate-200" />
        <MenuItem onClick={onClearLocal} danger>🗑 ローカル削除</MenuItem>
      </Menu>

      <Menu label="表示">
        <MenuItem onClick={() => setView("columns")} active={view === "columns"}>
          ✏️ 編集（カラム）
        </MenuItem>
        <MenuItem onClick={() => setView("overview")} active={view === "overview"}>
          👁️ 俯瞰（縦）
        </MenuItem>
      </Menu>

      <Menu label="テンプレート">
        <div className="px-2 pb-2">
          <select
            className="w-full rounded border px-2 py-1 text-sm"
            value={tplId}
            onChange={(e) => setTplId(e.currentTarget.value)}
            title={templates.find((t) => t.id === tplId)?.description}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">
            {templates.find((t) => t.id === tplId)?.description}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-1 px-2 pb-2">
          <Button onClick={onTplNewGroup}>新規グループで追加</Button>
          <Button onClick={onTplReplace}>現在のグループを置換</Button>
          <Button onClick={onTplAppend}>このグループへ追加</Button>
        </div>
      </Menu>

      <Menu label="グループ">
        <MenuItem onClick={onNewGroup}>➕ 新規グループ</MenuItem>
        <MenuItem onClick={onDuplicateGroup}>⧉ 複製（アクティブ）</MenuItem>
        <MenuItem onClick={onRemoveGroup} danger>× 削除（アクティブ）</MenuItem>
      </Menu>

      <Menu label="ヘルプ">
        <div className="px-3 py-2 text-sm text-slate-600 space-y-1">
          <p>⌘ / Ctrl + K：コマンド検索</p>
          <p>ドラッグ：タブ・ルート並べ替え</p>
          <p>JSONの入出力は「ファイル」から</p>
        </div>
      </Menu>
    </nav>
  );
}

/* ---- 小さなヘッドレスMenu ---- */

function Menu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group relative">
      <summary className="list-none cursor-pointer select-none rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">
        {label}
      </summary>
      <div className="absolute left-0 z-20 mt-1 w-80 rounded-xl border bg-white p-2 shadow-lg">
        {children}
      </div>
    </details>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      className={
        "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 " +
        (danger ? "text-red-600" : "") +
        (active ? " bg-slate-100" : "")
      }
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Button({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
