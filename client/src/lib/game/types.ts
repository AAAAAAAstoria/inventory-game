/**
 * types.ts
 * 游戏数据结构类型定义
 * 
 * 数学符号映射：
 *   I = 仓库集合, J = 门店集合, K = SKU集合
 *   WI_{i,k} = 仓库i的SKU k月初库存
 *   WL_{i,k} = 仓库i的SKU k安全库存下限（游戏参数）
 *   A_{j,k}  = 门店j的SKU k月初库存
 *   D_{j,k}  = 门店j的SKU k本月预测需求
 *   α_{i,j}  = 仓库i到门店j的单位运输成本
 *   γ_{j,k}  = 门店j的SKU k缺货惩罚成本
 *   h_{j,k}  = 门店j的SKU k持货成本（游戏参数）
 *   w_{i,k}  = 仓库i的SKU k持货成本（游戏参数）
 */

export interface GameData {
  warehouses: string[];
  stores: string[];
  skus: string[];
  sku_series: Record<string, string>;
  store_types: Record<string, string>;
  direct_stores: string[];
  supermarkets: string[];
  demand: Record<string, Record<string, number>>;
  current_store_inventory: Record<string, Record<string, number>>;
  warehouse_inventory: Record<string, Record<string, number>>;
  sku_penalty: Record<string, number>;
  transport_cost: Record<string, Record<string, number>>;
  store_holding_cost: Record<string, number>;
  warehouse_holding_cost: number;
  safety_stock: Record<string, Record<string, number>>;
  safety_stock_penalty: number;
  direct_store_constraints: Record<string, { storage_capacity: number; monthly_budget: number }>;
  supermarket_constraints: Record<string, { monthly_order_limit: number }>;
  transport_modes: {
    box: { cost_multiplier: number; description: string };
    pallet: { cost_multiplier: number; min_quantity: number; description: string };
  };
  game_settings: Record<string, unknown>;
}

/** 玩家决策：仓库 → 门店组 → 系列 → 数量 */
export type SeriesGroupDecisions = Record<string, Record<string, Record<string, number>>>;

/** 运输方式决策：仓库 → 门店组 → "box"|"pallet" */
export type TransportModeDecisions = Record<string, Record<string, 'box' | 'pallet'>>;

/** SKU级决策（内部计算用） */
export type SkuDecisions = Record<string, Record<string, Record<string, number>>>;

export interface CostSummary {
  c_trans: number;
  c_short: number;
  c_hold: number;
  c_hold_store: number;
  c_hold_warehouse: number;
  c_pen: number;
  c_total: number;
}

export interface ConstraintStatus {
  name: string;
  mode: string;
  satisfied: boolean;
  details: ConstraintDetail[];
  penalty?: number;
}

export interface ConstraintDetail {
  warehouse?: string;
  store?: string;
  sku?: string;
  series?: string;
  [key: string]: unknown;
}

export interface StoreFulfillment {
  total_demand: number;
  total_fulfilled: number;
  fulfillment_rate: number;
}

export interface InventoryUsage {
  total_available: number;
  total_sent: number;
  total_remaining: number;
  total_safety_stock: number;
  utilization_rate: number;
}

export interface StockoutDetail {
  store: string;
  sku: string;
  series: string;
  demand: number;
  current_inventory: number;
  received: number;
  shortfall: number;
  penalty_per_unit: number;
  stockout_cost: number;
}

export interface CalculationResult {
  stage: 1 | 2;
  valid: boolean;
  errors: string[];
  warnings: string[];
  violations: string[];
  cost_summary: CostSummary;
  constraint_status: Record<string, ConstraintStatus>;
  store_fulfillment: Record<string, StoreFulfillment>;
  inventory_usage: Record<string, InventoryUsage>;
  stockout_details: StockoutDetail[];
  warehouse_remaining: Record<string, Record<string, number>>;
  /** 系列级聚合展示数据 */
  series_summary: SeriesSummary[];
  /** 门店组满足率 */
  group_fulfillment: Record<string, { rate: number; fulfilled: number; demand: number }>;
}

export interface SeriesSummary {
  series: string;
  total_demand: number;
  total_received: number;
  total_shortage: number;
  shortage_cost: number;
  hold_cost: number;
}

export const SERIES_COLORS: Record<string, string> = {
  '节日礼盒系列(直营店特供)': '#f59e0b',
  '无糖系列': '#10b981',
  '营养谷物系列': '#3b82f6',
  '儿童系列': '#ec4899',
  '经典夹心系列': '#8b5cf6',
  '精致甜点系列': '#f97316',
};

export const SERIES_ICONS: Record<string, string> = {
  '节日礼盒系列(直营店特供)': '🎁',
  '无糖系列': '🌿',
  '营养谷物系列': '🌾',
  '儿童系列': '🐣',
  '经典夹心系列': '🍪',
  '精致甜点系列': '🍰',
};

export const STORE_GROUP_COLORS = {
  '直营组': '#6366f1',
  '商超组': '#0ea5e9',
};
