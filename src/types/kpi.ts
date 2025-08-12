// src/types/kpi.ts
export type NodeId = string;
export type Operator = "+" | "-" | "*" | "/";

/** 他ノードの計算結果へのリンク（エイリアス） */
export type LinkRef = {
  type: "calc";
  key: NodeId; // 参照先 calc ノードの id
};

export type KpiNode = {
  id: NodeId;
  name: string;
  kind: "leaf" | "calc";   // leaf: 末端の概念 / calc: 子を演算で結ぶ
  children: KpiNode[];
  /** 子と子の「間」の演算子（長さは children.length - 1）。未設定なら "*" を仮定 */
  ops?: Operator[];
  /** 単位（円, % など） */
  unit?: string;
  /** 入力の共有キー（同一キーは Input 上で 1 行に統合） */
  varKey?: string;
  /** 別の calc 結果をこのノードの値とする場合の参照 */
  link?: LinkRef;
};

/* ---------- ID ユーティリティ ---------- */
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/* ---------- ノード生成 ---------- */
export const createNode = (
  name = "ノード",
  kind: "leaf" | "calc" = "leaf",
  unit = "",
): KpiNode => ({
  id: newId(),
  name,
  kind,
  children: [],
  ops: [],
  unit,
});

/* ---------- 親子編集 ---------- */
export const appendChild = (parent: KpiNode, child?: KpiNode): KpiNode => {
  const c = child ?? createNode("子ノード", "leaf");
  const children = [...parent.children, c];
  let ops = parent.ops ?? [];
  if (parent.kind === "calc" && children.length >= 2) {
    ops = [...ops, "*"]; // 既定は掛け算
  }
  return { ...parent, children, ops };
};

export const removeChildAt = (parent: KpiNode, idx: number): KpiNode => {
  const children = parent.children.filter((_, i) => i !== idx);
  let ops = parent.ops ?? [];
  if (parent.kind === "calc" && ops.length > 0) {
    if (idx < ops.length) {
      ops = [...ops.slice(0, idx), ...ops.slice(idx + 1)];
    } else {
      ops = ops.slice(0, ops.length - 1);
    }
  }
  return { ...parent, children, ops };
};

export const setOpAt = (parent: KpiNode, idx: number, op: Operator): KpiNode => {
  const ops = [...(parent.ops ?? [])];
  ops[idx] = op;
  return { ...parent, ops };
};

export const moveChild = (parent: KpiNode, from: number, to: number): KpiNode => {
  const children = [...parent.children];
  if (from < 0 || to < 0 || from >= children.length || to >= children.length) return parent;
  const [item] = children.splice(from, 1);
  children.splice(to, 0, item);
  return { ...parent, children };
};

/* ---------- 文字列レンダリング（式プレビュー） ---------- */
// 優先順位 / 記号（和文記号）
const PREC: Record<Operator, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
const SYM: Record<Operator, string>  = { "+": "＋", "-": "−", "*": "×", "/": "÷" };

/** 非可換演算の括弧ルール */
const needParen = (
  op: Operator,
  side: "left" | "right",
  childPrec: number,
  curPrec: number
) => {
  // 右辺の - / は同順位でも必ず括弧が必要
  if (side === "right" && (op === "-" || op === "/")) return childPrec <= curPrec;
  return childPrec < curPrec;
};

type Rendered = { text: string; minPrec: number };

const renderExpr = (node: KpiNode): Rendered => {
  // calc 結果リンクは “このノード名” を 1 単位として扱う
  if (node.link?.type === "calc") {
    return { text: node.name, minPrec: Infinity };
  }
  // 末端 or 子なし calc
  if (node.kind !== "calc" || node.children.length === 0) {
    return { text: node.name, minPrec: Infinity };
  }

  const parts = node.children.map(renderExpr);
  const ops = node.ops ?? [];

  let acc = parts[0] ?? { text: "", minPrec: Infinity };
  for (let i = 0; i < parts.length - 1; i++) {
    const op = (ops[i] ?? "*") as Operator;
    const cur = PREC[op];

    const L = needParen(op, "left",  acc.minPrec, cur) ? `(${acc.text})` : acc.text;
    const R = parts[i + 1];
    const Rtxt = needParen(op, "right", R.minPrec, cur) ? `(${R.text})` : R.text;

    acc = { text: `${L} ${SYM[op]} ${Rtxt}`, minPrec: Math.min(cur, acc.minPrec, R.minPrec) };
  }
  return acc;
};

export const formatFormula = (node: KpiNode): string => {
  if (node.kind !== "calc" || node.children.length === 0) return node.name;
  const expr = renderExpr(node).text;
  return `${node.name} = ${expr}`;
};

/* ---------- 複製（ID 振り直し） ---------- */
export const cloneWithNewIds = (node: KpiNode): KpiNode => ({
  ...node,
  id: newId(),
  unit: node.unit ?? "",
  children: node.children.map(cloneWithNewIds),
  ops: node.ops ? [...node.ops] : [],
});

/* ---------- パス操作（カラム UI 用） ---------- */
export type NodePath = NodeId[]; // [rootId, childId, grandChildId, ...]

export const getNodeByPath = (roots: KpiNode[], path: NodePath): KpiNode | null => {
  let level = roots;
  let found: KpiNode | undefined;
  for (const id of path) {
    found = level.find((n) => n.id === id);
    if (!found) return null;
    level = found.children;
  }
  return found ?? null;
};

export const updateNodeByPath = (
  roots: KpiNode[],
  path: NodePath,
  updater: (node: KpiNode) => KpiNode
): KpiNode[] => {
  if (path.length === 0) return roots;
  const walk = (nodes: KpiNode[], depth: number): KpiNode[] =>
    nodes.map((n) => {
      if (n.id !== path[depth]) return n;
      if (depth === path.length - 1) return updater(n);
      return { ...n, children: walk(n.children, depth + 1) };
    });
  return walk(roots, 0);
};

export const updateParentByPath = (
  roots: KpiNode[],
  path: NodePath,
  updater: (parent: KpiNode) => KpiNode
): KpiNode[] => {
  if (path.length === 0) return roots;
  const parentPath = path.slice(0, -1);
  return updateNodeByPath(roots, parentPath, updater);
};

/* ---------- グループ（タブ） ---------- */
export type KpiGroup = {
  id: string;
  name: string;
  roots: KpiNode[];
};

export const createGroup = (name = "新しいグループ", roots: KpiNode[] = []): KpiGroup => ({
  id: newId(),
  name,
  roots,
});

export const cloneGroup = (g: KpiGroup): KpiGroup => ({
  id: newId(),
  name: `${g.name} (コピー)`,
  roots: g.roots.map((r) => cloneWithNewIds(r)),
});

/* ---------- 式の図解（トークン化） ---------- */
export type FormulaToken =
  | { kind: "node"; id: NodeId; name: string }
  | { kind: "op"; op: Operator }
  | { kind: "paren"; dir: "(" | ")" }
  | { kind: "eq" };

const renderExprTokens = (node: KpiNode): { tokens: FormulaToken[]; minPrec: number } => {
  if (node.link?.type === "calc") {
    return { tokens: [{ kind: "node", id: node.id, name: node.name }], minPrec: Infinity };
  }
  if (node.kind !== "calc" || node.children.length === 0) {
    return { tokens: [{ kind: "node", id: node.id, name: node.name }], minPrec: Infinity };
  }

  const parts = node.children.map(renderExprTokens);
  const ops = node.ops ?? [];

  let accTokens = parts[0]?.tokens ?? [];
  let accMinPrec = parts[0]?.minPrec ?? Infinity;

  for (let i = 0; i < node.children.length - 1; i++) {
    const op = (ops[i] ?? "*") as Operator;
    const cur = PREC[op];

    // 左側
    let left = accTokens;
    if (needParen(op, "left", accMinPrec, cur)) {
      left = [{ kind: "paren", dir: "(" }, ...left, { kind: "paren", dir: ")" }];
    }

    // 右側
    const rightPart = parts[i + 1]!;
    let right = rightPart.tokens;
    if (needParen(op, "right", rightPart.minPrec, cur)) {
      right = [{ kind: "paren", dir: "(" }, ...right, { kind: "paren", dir: ")" }];
    }

    accTokens = [...left, { kind: "op", op }, ...right];
    accMinPrec = Math.min(cur, accMinPrec, rightPart.minPrec);
  }
  return { tokens: accTokens, minPrec: accMinPrec };
};

/** 1 つの KPI を式パネル用トークンへ（先頭に ‘名前＝’ を付与） */
export const tokenizeFormula = (node: KpiNode): FormulaToken[] => {
  if (node.kind !== "calc" || node.children.length === 0) {
    return [{ kind: "node", id: node.id, name: node.name }];
  }
  const body = renderExprTokens(node).tokens;
  return [{ kind: "node", id: node.id, name: node.name }, { kind: "eq" }, ...body];
};

/* ---------- 入力（葉）の自動グルーピングキー ---------- */
export function leafGroupingKey(n: KpiNode): string {
  const k = n.varKey?.trim();
  if (k) return k;
  return `${n.name}__${n.unit ?? ""}`;
}

/* ---------- 列挙ユーティリティ ---------- */
export function enumerateLeaves(roots: KpiNode[]): KpiNode[] {
  const out: KpiNode[] = [];
  const walk = (n: KpiNode) => {
    if (n.kind === "calc" && n.children.length > 0) n.children.forEach(walk);
    else out.push(n);
  };
  roots.forEach(walk);
  return out;
}

export function enumerateCalcs(roots: KpiNode[]): KpiNode[] {
  const out: KpiNode[] = [];
  const walk = (n: KpiNode) => {
    if (n.kind === "calc" && n.children.length > 0) {
      out.push(n);
      n.children.forEach(walk);
    }
  };
  roots.forEach(walk);
  return out;
}
