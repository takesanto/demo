// src/components/AppClient.tsx
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { KpiGroup } from "@/types/kpi";
import ClientOnly from "@/components/ClientOnly";

// dnd-kit を内部で使うコンポーネント（例：KpiColumnsやボード全体）を SSR 無効で読み込み
const KpiColumnsNoSSR = dynamic(() => import("@/components/KpiColumns"), {
  ssr: false,
});

type Props = {
  initialGroups: KpiGroup[];
};

export default function AppClient({ initialGroups }: Props) {
  // ★ サーバから渡された初期データをそのまま “初期値” にする
  //   ここで build し直さないことが超重要！
  const [groups, setGroups] = useState<KpiGroup[]>(() => initialGroups);

  return (
    <main className="min-h-screen">
      {/* dnd 部分はクライアントだけで描画される（SSRしない） */}
      <ClientOnly>
        <KpiColumnsNoSSR
          roots={groups[0]?.roots ?? []}
          onChange={(nextRoots) => {
            const next = [...groups];
            if (next[0]) next[0] = { ...next[0], roots: nextRoots };
            setGroups(next);
          }}
        />
      </ClientOnly>

      {/* JSONプレビューは “差分許容” か “クライアントだけ” のどちらか */}
      <pre
        className="mt-3 text-xs bg-slate-50 p-3 rounded overflow-auto"
        suppressHydrationWarning
      >
        {JSON.stringify(groups, null, 2)}
      </pre>
      {/* もしくは:
      <ClientOnly>
        <pre className="mt-3 text-xs bg-slate-50 p-3 rounded overflow-auto">
          {JSON.stringify(groups, null, 2)}
        </pre>
      </ClientOnly>
      */}
    </main>
  );
}
