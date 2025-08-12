// src/components/UnitEditor.tsx
"use client";

const SUGGEST = ["円", "千円", "百万円", "%", "人", "件", "個", "点", "回", "日", "月", "年", "時間"];

export default function UnitEditor({
  value,
  onChange,
  className = "",
}: {
  value?: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={"flex items-center gap-1 " + className}>
      <span className="text-[11px] text-slate-500">単位</span>
      <input
        list="kpi-unit-suggest"
        value={value ?? ""}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder="例）円, %, 件"
        className="w-24 rounded border px-2 py-1 text-xs"
      />
      <datalist id="kpi-unit-suggest">
        {SUGGEST.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
