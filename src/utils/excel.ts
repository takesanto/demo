// src/utils/excel.ts
import * as XLSX from "xlsx";
import type { KpiGroup, KpiNode, Operator } from "@/types/kpi";

/* =======================================================
   Excel 名のユーティリティ（日本語でも一意になるように）
======================================================= */
function hash36(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(36);
}

/** Excel の「名前」を安全 & 一意に作る */
function makeExcelName(
  label: string,     // 表示用ラベル（日本語OK）
  key: string,       // 一意性の元（varKey や node.id）
  used: Set<string>, // 既に使った名前（小文字）
  prefix: "v" | "n"  // 変数(v) / ノード(n)
) {
  const ascii = (label || "x")
    .normalize("NFKD")
    .replace(/[^\w]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");

  const h = hash36(key).slice(0, 8);
  let name = `${prefix}_${h}_${ascii || "x"}`;
  if (!/^[A-Za-z_]/.test(name)) name = "_" + name;
  name = name.slice(0, 250);

  let uniq = name, i = 2;
  while (used.has(uniq.toLowerCase())) uniq = `${name}_${i++}`;
  used.add(uniq.toLowerCase());
  return uniq;
}

const PROC_SHEET = "Process";

/** ツリー全体から calc ノードを列挙（重複なし） */
function collectAllCalcs(groups: KpiGroup[]): KpiNode[] {
  const out: KpiNode[] = [];
  const seen = new Set<string>();
  const walk = (n: KpiNode) => {
    if (n.kind === "calc" && n.children.length > 0 && !seen.has(n.id)) {
      seen.add(n.id);
      out.push(n);
    }
    n.children.forEach(walk);
  };
  groups.forEach(g => g.roots.forEach(walk));
  return out;
}

/* =========================================
   共通：演算子の優先順位・ユーティリティ
========================================= */
const PREC: Record<Operator, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
const OP_JA: Record<Operator, string>  = { "+": "＋", "-": "−", "*": "×", "/": "÷" };

function excelSafeName(node: KpiNode): string {
  const short = (node.id || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 8);
  const base = (node.name || "node").replace(/[^A-Za-z0-9_]/g, "_");
  let name = `n_${short}_${base}`;
  if (!/^[A-Za-z_]/.test(name)) name = "_" + name;
  return name.slice(0, 250);
}

function isLeaf(node: KpiNode) {
  return node.kind !== "calc" || node.children.length === 0;
}

// 非可換演算の括弧ルール
const needParen = (
  op: Operator,
  side: "left" | "right",
  childPrec: number,
  curPrec: number
) => {
  // 右辺の - / は同順位でも必ず括弧
  if (side === "right" && (op === "-" || op === "/")) return childPrec <= curPrec;
  return childPrec < curPrec;
};

// 子行セル参照だけで式を組み立てる（右再帰で「A - (B + C …)」を作る）
function buildExprFromCells(cells: string[], ops: Operator[]): string {
  if (cells.length === 0) return "0";
  if (cells.length === 1) return cells[0];

  function build(i: number): { text: string; minPrec: number } {
    if (i === cells.length - 1) return { text: cells[i], minPrec: Infinity };
    const op = (ops[i] ?? "*") as Operator;
    const cur = PREC[op];

    const left  = { text: cells[i], minPrec: Infinity };
    const right = build(i + 1);

    const L = needParen(op, "left",  left.minPrec,  cur) ? `(${left.text})`  : left.text;
    const R = needParen(op, "right", right.minPrec, cur) ? `(${right.text})` : right.text;

    return { text: `${L} ${op} ${R}`, minPrec: Math.min(cur, left.minPrec, right.minPrec) };
  }

  return build(0).text;
}

/* テキスト式（日本語名＋全角演算子）。括弧ルールは Excel 式と同じ */
function renderTextExpr(n: KpiNode): { text: string; minPrec: number } {
  if (isLeaf(n)) return { text: n.name, minPrec: Infinity };
  const parts = n.children.map(renderTextExpr);
  const ops = n.ops ?? [];
  let acc = parts[0]!;
  for (let i = 0; i < n.children.length - 1; i++) {
    const op = (ops[i] ?? "*") as Operator;
    const cur = PREC[op];
    const L = needParen(op, "left", acc.minPrec, cur) ? `(${acc.text})` : acc.text;
    const R = parts[i + 1]!;
    const Rtxt = needParen(op, "right", R.minPrec, cur) ? `(${R.text})` : R.text;
    acc = { text: `${L}${OP_JA[op]}${Rtxt}`, minPrec: Math.min(cur, acc.minPrec, R.minPrec) };
  }
  return acc;
}
const formatFormulaText = (n: KpiNode) =>
  n.kind === "calc" && n.children.length > 0
    ? `${n.name}＝${renderTextExpr(n).text}`
    : n.name;

/* =========================================
   ① 単列版（旧：Input=1セル / Process=1セル）
========================================= */
type SimpleRowInfo = { node: KpiNode; name: string; path: string; group: string };

function collectSimple(groups: KpiGroup[]) {
  const leaves: SimpleRowInfo[] = [];
  const calcs: SimpleRowInfo[] = [];
  const walk = (n: KpiNode, group: string, path: string[]) => {
    const info = { node: n, name: excelSafeName(n), path: [...path, n.name].join(" › "), group };
    if (isLeaf(n)) {
      leaves.push(info);
    } else {
      calcs.push(info);
      n.children.forEach((c) => walk(c, group, [...path, n.name]));
    }
  };
  groups.forEach((g) => g.roots.forEach((r) => walk(r, g.name, [])));
  return { leaves, calcs };
}

function renderExprSingle(
  node: KpiNode,
  nameOf: (n: KpiNode) => string
): { text: string; minPrec: number } {
  if ((node as any).link?.type === "calc") {
    return { text: nameOf(node), minPrec: Infinity };
  }
  if (isLeaf(node)) return { text: nameOf(node), minPrec: Infinity };

  const parts = node.children.map((c) => renderExprSingle(c, nameOf));
  const ops = node.ops ?? [];
  let acc = parts[0] ?? { text: "0", minPrec: Infinity };

  for (let i = 0; i < parts.length - 1; i++) {
    const op = (ops[i] ?? "*") as Operator;
    const prec = PREC[op];

    const leftText = needParen(op, "left", acc.minPrec, prec) ? `(${acc.text})` : acc.text;
    const right = parts[i + 1];
    const rightText = needParen(op, "right", right.minPrec, prec) ? `(${right.text})` : right.text;

    acc = {
      text: `${leftText} ${op} ${rightText}`,
      minPrec: Math.min(prec, acc.minPrec, right.minPrec),
    };
  }
  return acc;
}

/** 旧仕様：Input/Process の B 列に1セル、Outputは根を参照 */
export function exportIPOXlsx(groups: KpiGroup[], filename = "kpi_model.xlsx") {
  const wb = XLSX.utils.book_new();
  const names: { Name: string; Ref: string }[] = [];

  const { leaves, calcs } = collectSimple(groups);

  // Input
  const inAOA: any[][] = [["項目", "値", "グループ", "パス", "NodeId", "Name"]];
  leaves.forEach((ri) => inAOA.push([ri.node.name, "", ri.group, ri.path, ri.node.id, ri.name]));
  const wsIn = XLSX.utils.aoa_to_sheet(inAOA);
  XLSX.utils.book_append_sheet(wb, wsIn, "Input");

  // Process
  const prAOA: any[][] = [["項目", "式", "グループ", "パス", "NodeId", "Name"]];
  const nameMap = new Map<string, string>();
  leaves.forEach((ri) => nameMap.set(ri.node.id, ri.name));
  calcs.forEach((ri) => nameMap.set(ri.node.id, ri.name));
  calcs.forEach((ri) => prAOA.push([ri.node.name, "", ri.group, ri.path, ri.node.id, ri.name]));
  const wsPr = XLSX.utils.aoa_to_sheet(prAOA);

  calcs.forEach((ri, idx) => {
    const r = idx + 2;
    const expr = renderExprSingle(
      ri.node,
      (n) =>
        (n as any).link?.type === "calc"
          ? nameMap.get((n as any).link.key) || excelSafeName(n)
          : nameMap.get(n.id) || excelSafeName(n)
    ).text;
    (wsPr as any)[`B${r}`] = { t: "n", f: `=${expr}` };
  });
  XLSX.utils.book_append_sheet(wb, wsPr, "Process");

  // Output
  const outAOA: any[][] = [["グループ", "KPI", "値", "NodeId", "Name"]];
  groups.forEach((g) =>
    g.roots.forEach((root) => {
      const nm = nameMap.get(root.id) || excelSafeName(root);
      outAOA.push([g.name, root.name, "", root.id, nm]);
    })
  );
  const wsOut = XLSX.utils.aoa_to_sheet(outAOA);
  for (let r = 2; r <= outAOA.length; r++) {
    const nm = (wsOut as any)[`E${r}`]?.v as string | undefined;
    if (nm) (wsOut as any)[`C${r}`] = { t: "n", f: `=${nm}` };
  }
  XLSX.utils.book_append_sheet(wb, wsOut, "Output");

  // 名前定義
  leaves.forEach((ri, i) => names.push({ Name: ri.name, Ref: `'Input'!$B$${i + 2}` }));
  calcs.forEach((ri, i) => names.push({ Name: ri.name, Ref: `'Process'!$B$${i + 2}` }));
  (wb as any).Workbook = { Names: names };

  XLSX.writeFile(wb, filename);
}

/* =========================================
   ② 期間横展開版（Input/Process/Output を A〜 に展開）
========================================= */
export type PeriodConfig = {
  startYM: string; // "2025-01"
  periods: number; // 列数
  freq?: "month" | "quarter" | "year"; // いまは month のみ
  headerLabel?: (y: number, m: number, idx: number) => string;
};

const DEFAULT_CFG: PeriodConfig = {
  startYM: "2025-01",
  periods: 12,
  freq: "month",
  headerLabel: (y, m) => `${y}年${m}月`,
};

// 列番号(1始まり)→A1列名
function a1col(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
const addr = (r: number, c: number) => `${a1col(c)}${r}`;

function addMonths(y: number, m: number, delta: number) {
  const t = y * 12 + (m - 1) + delta;
  const yy = Math.floor(t / 12);
  const mm = (t % 12) + 1;
  return { y: yy, m: mm };
}

type DepthRowInfo = {
  node: KpiNode;
  name: string;
  path: string;
  group: string;
  depth: number;
};

function collectWithDepth(groups: KpiGroup[]) {
  const leaves: DepthRowInfo[] = [];
  const calcs: DepthRowInfo[] = [];

  const go = (n: KpiNode, group: string, path: string[], depth: number) => {
    const info: DepthRowInfo = {
      node: n,
      name: excelSafeName(n),
      path: [...path, n.name].join(" › "),
      group,
      depth,
    };
    if (isLeaf(n)) {
      leaves.push(info);
    } else {
      calcs.push(info);
      n.children.forEach((c) => go(c, group, [...path, n.name], depth + 1));
    }
  };

  groups.forEach((g) => g.roots.forEach((r) => go(r, g.name, [], 0)));
  return { leaves, calcs };
}

/** INDEX(定義名,1,列) で同一期間の値を引く */
const refAt = (rangeName: string, colIdx1: number) => `INDEX(${rangeName},1,${colIdx1})`;

/** 旧 helper（保持だけ） */
function renderExprAt(
  node: KpiNode,
  colIdx1: number,
  nameOf: (n: KpiNode) => string
): { text: string; minPrec: number } {
  if ((node as any).link?.type === "calc") {
    return { text: refAt(nameOf(node), colIdx1), minPrec: Infinity };
  }
  if (isLeaf(node)) return { text: refAt(nameOf(node), colIdx1), minPrec: Infinity };

  const parts = node.children.map((c) => renderExprAt(c, colIdx1, nameOf));
  const ops = node.ops ?? [];
  let acc = parts[0]!;

  for (let i = 0; i < parts.length - 1; i++) {
    const op = (ops[i] ?? "*") as Operator;
    const prec = PREC[op];

    const leftText  = needParen(op, "left",  acc.minPrec, prec) ? `(${acc.text})` : acc.text;
    const rightPart = parts[i + 1]!;
    const rightText = needParen(op, "right", rightPart.minPrec, prec) ? `(${rightPart.text})` : rightPart.text;

    acc = {
      text: `${leftText} ${op} ${rightText}`,
      minPrec: Math.min(prec, acc.minPrec, rightPart.minPrec),
    };
  }
  return acc;
}

// 期間版：varKey で Input を一意化、calcリンク対応 + 行参照優先 + 式テキスト行＆深さ列
export function exportIPOXlsxPeriods(
  groups: KpiGroup[],
  filename = "kpi_model_periods.xlsx",
  cfg: Partial<PeriodConfig> = {}
) {
  const C = { ...DEFAULT_CFG, ...cfg };
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>(); // Excel 名の重複回避

  const depthCol = 1; // A: 深さ（見出しテキスト行のみ）
  const labelCol = 2; // B: 項目 / 見出しテキスト
  const unitCol  = 3; // C: 単位
  const startCol = 4; // D〜が期間
  const headerRow = 4;

  const { leaves } = collectWithDepth(groups);

  // === 期間ラベル ===
  const [Y0, M0] = C.startYM.split("-").map((v) => parseInt(v, 10));
  const labels: string[] = Array.from({ length: C.periods }, (_, i) => {
    const { y, m } = addMonths(Y0, M0, i);
    return C.headerLabel!(y, m, i);
  });
  const endCol   = startCol + C.periods - 1;
  const endColA1 = a1col(endCol);

  // === varKey（未設定は name+unit）で葉をグルーピング ===
  const keyOf = (n: KpiNode) => (n.varKey?.trim() || `${n.name}__${n.unit ?? ""}`);
  type VarEntry = { key: string; name: string; unit: string; nodes: KpiNode[]; row?: number; excelName?: string };

  const varMap = new Map<string, VarEntry>();
  for (const ri of leaves) {
    if ((ri.node as any).link?.type === "calc") continue; // calcリンク葉は入力にしない
    const k = keyOf(ri.node);
    const ex = varMap.get(k);
    if (ex) {
      ex.nodes.push(ri.node);
      if (!ex.unit && ri.node.unit) ex.unit = ri.node.unit;
    } else {
      varMap.set(k, { key: k, name: ri.node.name, unit: ri.node.unit ?? "", nodes: [ri.node] });
    }
  }
  const varEntries = Array.from(varMap.values());

  // Excel 名（入力変数用）
  const excelNameForVar = (key: string, label: string) => makeExcelName(label, key, usedNames, "v");

  /* -------------------- Input -------------------- */
  const wsIn = XLSX.utils.aoa_to_sheet([]);
  (wsIn as any)[addr(headerRow, labelCol)] = { t: "s", v: "項目" };
  (wsIn as any)[addr(headerRow, unitCol)]  = { t: "s", v: "単位" };
  for (let j = 0; j < C.periods; j++) (wsIn as any)[addr(headerRow, startCol + j)] = { t: "s", v: labels[j] };

  const inStartRow = headerRow + 1;
  let inLastRow = headerRow;
  varEntries.forEach((ve, i) => {
    const r = inStartRow + i;
    inLastRow = r;
    ve.row = r;
    ve.excelName = excelNameForVar(ve.key, ve.name);
    (wsIn as any)[addr(r, labelCol)] = { t: "s", v: ve.name };
    (wsIn as any)[addr(r, unitCol)]  = { t: "s", v: ve.unit };
  });

  (wsIn as any)["!ref"]  = `A1:${endColA1}${Math.max(inLastRow, headerRow)}`;
  (wsIn as any)["!cols"] = [
    { wch: 4 }, // A: 深さ
    { wch: 28 }, // B: 項目
    { wch: 8 },  // C: 単位
    ...Array(C.periods).fill({ wch: 12 }),
  ];
  XLSX.utils.book_append_sheet(wb, wsIn, "Input");

  // varKey -> Excel名
  const varNameOf = new Map<string, string>();
  varEntries.forEach((ve) => varNameOf.set(ve.key, ve.excelName!));

  /* === 事前に全 calc に Excel 名を割り当て（順序非依存） === */
  const allCalcs = collectAllCalcs(groups);
  const calcNameById = new Map<string, string>();
  allCalcs.forEach(n => calcNameById.set(n.id, makeExcelName(n.name, n.id, usedNames, "n")));

  // 値ノード/リンク/子calc を「この列の値」に解決（行が分かればセル、なければ名前）
  const valueRefAt = (
    node: KpiNode,
    colIdx1: number,
    processRowOf: Map<string, number>
  ): string => {
    // calc結果リンク
    if ((node as any).link?.type === "calc") {
      const row = processRowOf.get((node as any).link.key);
      if (row) return `'${PROC_SHEET}'!${addr(row, startCol + (colIdx1 - 1))}`;
      const nm = calcNameById.get((node as any).link.key)!;
      return refAt(nm, colIdx1);
    }
    // 葉
    if (node.kind !== "calc" || node.children.length === 0) {
      const nm = varNameOf.get(keyOf(node))!;
      return refAt(nm, colIdx1);
    }
    // 子 calc
    const row = processRowOf.get(node.id);
    if (row) return `'${PROC_SHEET}'!${addr(row, startCol + (colIdx1 - 1))}`;
    const nm = calcNameById.get(node.id)!;
    return refAt(nm, colIdx1);
  };

  /* -------------------- Process -------------------- */
  const wsPr = XLSX.utils.aoa_to_sheet([]);
  (wsPr as any)[addr(headerRow, labelCol)] = { t: "s", v: "項目" };
  (wsPr as any)[addr(headerRow, unitCol)]  = { t: "s", v: "単位" };
  for (let j = 0; j < C.periods; j++) (wsPr as any)[addr(headerRow, startCol + j)] = { t: "s", v: labels[j] };

  let prLastRow = headerRow;
  const processRowOf = new Map<string, number>(); // calc 見出し行（数値の行の row 番号）

  // 見出しテキスト → 親（数式は後で）→ 子参照 → 親に式設定 → 空行 → 再帰
  const writeBlock = (n: KpiNode, depth: number) => {
    if (n.kind !== "calc" || n.children.length === 0) return;

    // 0) 見出しテキスト行（ここに深さも出す）
    const hrow = ++prLastRow;
    (wsPr as any)[addr(hrow, depthCol)] = { t: "n", v: depth };
    (wsPr as any)[addr(hrow, labelCol)] = { t: "s", v: formatFormulaText(n) };

    // 1) 親（この行が計算値の行）: 後で式を入れる
    const r = ++prLastRow;
    processRowOf.set(n.id, r);
    (wsPr as any)[addr(r, labelCol)] = { t: "s", v: n.name };
    (wsPr as any)[addr(r, unitCol)]  = { t: "s", v: n.unit ?? "" };

    // 2) 子の参照行
    const childRows: number[] = [];
    n.children.forEach((child) => {
      const rr = ++prLastRow;
      childRows.push(rr);
      (wsPr as any)[addr(rr, labelCol)] = { t: "s", v: child.name };
      (wsPr as any)[addr(rr, unitCol)]  = { t: "s", v: child.unit ?? "" };
      for (let j = 0; j < C.periods; j++) {
        const refText = valueRefAt(child, j + 1, processRowOf);
        (wsPr as any)[addr(rr, startCol + j)] = { t: "n", f: `=${refText}` };
      }
    });

    // 3) 親行の式は“同一ブロックの子行セルだけ”で構築（D6*D7, D14-(D21+D22) など）
    for (let j = 0; j < C.periods; j++) {
      const cells = childRows.map((rr) => addr(rr, startCol + j));
      const expr  = buildExprFromCells(cells, n.ops ?? []);
      (wsPr as any)[addr(r, startCol + j)] = { t: "n", f: `=${expr}` };
    }

    // 4) 空行
    prLastRow++;

    // 5) 子 calc のブロックを展開（深さ+1）
    n.children.forEach((c) => writeBlock(c, depth + 1));
  };

  // ルートたちから展開
  groups.forEach((g) => g.roots.forEach((r) => writeBlock(r, 1)));

  (wsPr as any)["!ref"]  = `A1:${endColA1}${Math.max(prLastRow, headerRow)}`;
  (wsPr as any)["!cols"] = [
    { wch: 4 },  // A: 深さ
    { wch: 28 }, // B: 項目（見出しテキストもここ）
    { wch: 8 },  // C: 単位
    ...Array(C.periods).fill({ wch: 12 }),
  ];
  XLSX.utils.book_append_sheet(wb, wsPr, PROC_SHEET);

  /* -------------------- Output（ルートのみ） -------------------- */
  const wsOut = XLSX.utils.aoa_to_sheet([]);
  (wsOut as any)[addr(headerRow, labelCol)] = { t: "s", v: "項目" };
  (wsOut as any)[addr(headerRow, unitCol)]  = { t: "s", v: "単位" };
  for (let j = 0; j < C.periods; j++) (wsOut as any)[addr(headerRow, startCol + j)] = { t: "s", v: labels[j] };

  let outLastRow = headerRow;
  groups.forEach((g) => {
    g.roots.forEach((root) => {
      const r = ++outLastRow;
      (wsOut as any)[addr(r, labelCol)] = { t: "s", v: root.name };
      (wsOut as any)[addr(r, unitCol)]  = { t: "s", v: root.unit ?? "" };

      const nm =
        (root as any).link?.type === "calc"
          ? calcNameById.get((root as any).link.key)!
          : root.kind === "calc" && root.children.length > 0
          ? calcNameById.get(root.id)!
          : varNameOf.get(keyOf(root))!;

      for (let j = 0; j < C.periods; j++) {
        (wsOut as any)[addr(r, startCol + j)] = { t: "n", f: `=${refAt(nm, j + 1)}` };
      }
    });
    outLastRow++;
  });

  (wsOut as any)["!ref"]  = `A1:${endColA1}${Math.max(outLastRow, headerRow)}`;
  (wsOut as any)["!cols"] = [
    { wch: 4 },
    { wch: 28 },
    { wch: 8 },
    ...Array(C.periods).fill({ wch: 12 }),
  ];
  XLSX.utils.book_append_sheet(wb, wsOut, "Output");

  /* -------------------- 名前定義（Named Ranges） -------------------- */
  const names: { Name: string; Ref: string }[] = [];

  // varKey 名 → Input の横1行
  varEntries.forEach((ve) => {
    names.push({
      Name: ve.excelName!,
      Ref: `'Input'!$${a1col(startCol)}$${ve.row}:$${endColA1}$${ve.row}`,
    });
  });

  // calc 名 → Process の横1行（親の数値行）
  calcNameById.forEach((nm, id) => {
    const row = processRowOf.get(id);
    if (row) {
      names.push({
        Name: nm,
        Ref: `'${PROC_SHEET}'!$${a1col(startCol)}$${row}:$${endColA1}$${row}`,
      });
    }
  });

  (wb as any).Workbook = { Names: names };
  XLSX.writeFile(wb, filename);
}
