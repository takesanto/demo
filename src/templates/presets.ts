// src/templates/presets.ts
import {
  createNode,
  createGroup,
  type KpiGroup,
  type KpiNode,
  type Operator,
} from "@/types/kpi";

/** アプリが参照するテンプレ型 */
export type GroupTemplate = {
  id: string;
  name: string;
  description?: string;
  build: () => KpiGroup;
};

/* ---------------------------
   小さなユーティリティ
--------------------------- */

/** leaf/calc のショートハンド（単位対応） */
const leaf = (name: string, unit = ""): KpiNode => createNode(name, "leaf", unit);

const calc = (
  name: string,
  children: KpiNode[],
  ops?: Operator[],
  unit = ""
): KpiNode => {
  const n = createNode(name, "calc", unit);
  n.children = children;
  const need = Math.max(0, children.length - 1);
  n.ops =
    ops && ops.length === need ? ops : Array.from({ length: need }, () => "*" as Operator);
  return n;
};

// お好みで：加算・減算・乗算・除算の簡便関数
const sum = (name: string, kids: KpiNode[], unit = "") =>
  calc(name, kids, Array(Math.max(0, kids.length - 1)).fill("+") as Operator[], unit);
const diff = (name: string, a: KpiNode, b: KpiNode, unit = "") => calc(name, [a, b], ["-"], unit);
const prod = (name: string, kids: KpiNode[], unit = "") =>
  calc(name, kids, Array(Math.max(0, kids.length - 1)).fill("*") as Operator[], unit);
const ratio = (name: string, a: KpiNode, b: KpiNode, unit = "") => calc(name, [a, b], ["/"], unit);

/* ---------------------------
   1) ベーシック（動作確認用）
--------------------------- */
const basicSales: GroupTemplate = {
  id: "basic_sales_v1",
  name: "基本：売上（客数×客単価）",
  description: "最小構成のサンプル。売上 = 客数 × 客単価。",
  build: () => {
    const 客数 = leaf("客数", "人");
    const 客単価 = leaf("客単価", "円");
    const 売上 = prod("売上", [客数, 客単価], "円");
    return createGroup("基本テンプレ", [売上]);
  },
};

/* ---------------------------
   2) SaaS P&L（月次）
   - 売上高 = 有料顧客数 × ARPA
   - 売上総利益 = 売上高 − 売上原価（変動 + 固定）
   - 営業利益 = 売上総利益 − 営業費用（S&M + R&D + G&A）
   - EBITDA = 営業利益 + 減価償却費
   - EBITDAマージン = EBITDA ÷ 売上高
   - 粗利率 = 売上総利益 ÷ 売上高
   - Rule of 40 = 売上成長率 + EBITDAマージン
--------------------------- */
const saasPL: GroupTemplate = {
  id: "saas_pl_v1",
  name: "SaaS：P&L（月次）",
  description:
    "SaaSの月次P/L。売上高、粗利、営業費用、営業利益、EBITDA、マージン、Rule of 40 まで。",
  build: () => {
    // 収益まわり
    const 有料顧客数 = leaf("有料顧客数", "社");
    const ARPA = leaf("ARPA（月額単価）", "円");
    const 売上高 = prod("売上高（月次）", [有料顧客数, ARPA], "円"); // = MRR

    // 原価・粗利
    const 変動原価 = leaf("売上原価（変動）", "円");
    const 固定原価 = leaf("売上原価（固定）", "円");
    const 売上原価 = sum("売上原価（合計）", [変動原価, 固定原価], "円");
    const 売上総利益 = diff("売上総利益", 売上高, 売上原価, "円");
    const 粗利率 = ratio("粗利率", 売上総利益, 売上高, "%");

    // 販管費・営業利益
    const SM = leaf("販管費（S&M）", "円");
    const RD = leaf("研究開発費（R&D）", "円");
    const GA = leaf("一般管理費（G&A）", "円");
    const 営業費用 = sum("営業費用（販管費合計）", [SM, RD, GA], "円");
    const 営業利益 = diff("営業利益", 売上総利益, 営業費用, "円");

    // EBITDA・マージン
    const 減価償却費 = leaf("減価償却費（D&A）", "円");
    const EBITDA = sum("EBITDA", [営業利益, 減価償却費], "円");
    const EBITDAマージン = ratio("EBITDAマージン", EBITDA, 売上高, "%");

    // Rule of 40
    const 売上成長率 = leaf("売上成長率（月次）", "%"); // 月次YoYやMoMのどちらでも。値の解釈は運用で。
    const RuleOf40 = sum("Rule of 40", [売上成長率, EBITDAマージン], "%");

    // 表示順：見やすい並びに
    return createGroup("SaaS P&L（月次）", [
      売上高,
      売上原価,
      売上総利益,
      営業費用,
      営業利益,
      減価償却費,
      EBITDA,
      EBITDAマージン,
      粗利率,
      RuleOf40,
    ]);
  },
};

/* ---------------------------
   3) SaaS ユニットエコノミクス
   - CAC = 獲得費用 / 新規顧客数
   - LTV = (ARPA × 粗利率) / 月次解約率
   - LTV/CAC = LTV / CAC
   - 回収月数 = CAC / (ARPA × 粗利率)
   ※ % は 0.7=70% で入力
--------------------------- */
const saasUnitEconomics: GroupTemplate = {
  id: "saas_unit_v1",
  name: "SaaS：ユニットエコノミクス",
  description:
    "CAC・LTV・LTV/CAC・回収月数（Payback）。％は実数入力を想定（0.7=70%）。",
  build: () => {
    const 新規顧客数 = leaf("新規有料顧客数", "社");
    const 獲得費用 = leaf("獲得関連費用（S&M）", "円");
    const CAC = ratio("CAC（顧客獲得単価）", 獲得費用, 新規顧客数, "円");

    const ARPA2 = leaf("ARPA（月額単価）", "円");
    const 粗利率2 = leaf("粗利率（実数）", "%");
    const 月次解約率 = leaf("月次解約率（Churn）", "%");

    // LTV = (ARPA × 粗利率) / 解約率
    const LTV = calc("LTV", [ARPA2, 粗利率2, 月次解約率], ["*", "/"], "円");

    const LTVtoCAC = ratio("LTV/CAC", LTV, CAC, "");
    // 回収月数 = CAC / (ARPA × 粗利率) ＝ (CAC / ARPA) / 粗利率
    const 回収月数 = calc("回収月数（Payback）", [CAC, ARPA2, 粗利率2], ["/", "/"], "月");

    return createGroup("SaaS ユニットエコノミクス", [CAC, LTV, LTVtoCAC, 回収月数]);
  },
};

/* ---------------------------
   必要ならここに追加テンプレを増やせます
   例）SaaS セールスファネル、プロダクトKPI など
--------------------------- */

/** アプリで使うテンプレ一覧（先頭がデフォルト選択） */
export const TEMPLATES: GroupTemplate[] = [
  basicSales,
  saasPL,
  saasUnitEconomics,
];
