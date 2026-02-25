/**
 * engine.ts
 * 游戏计算引擎（纯 TypeScript，无后端依赖）
 * 
 * 【目标函数】
 *   C_total = C_trans + C_short + C_hold + C_pen
 *   - C_trans = Σ_{i,j,k} α_{i,j} × multiplier × x_{i,j,k}
 *   - C_short = Σ_{j,k} γ_{j,k} × max(0, D_{j,k} - A_{j,k} - Σ_i x_{i,j,k})
 *   - C_hold  = Σ_{j,k} h_{j,k} × H_{j,k} + Σ_{i,k} w_{i,k} × F_{i,k}
 *   - C_pen   = C2_SOFT惩罚（第一轮）+ C4_SOFT惩罚（第二轮）
 * 
 * 【约束体系】
 *   第一轮：C1(HARD) + C2(SOFT) + C6(HARD隐式)
 *   第二轮：C1(HARD) + C2(HARD) + C3(HARD) + C4(SOFT) + C5(HARD) + C6(HARD隐式) + 托盘最低量
 */

import type {
  GameData,
  SkuDecisions,
  CalculationResult,
  CostSummary,
  ConstraintStatus,
  StoreFulfillment,
  InventoryUsage,
  StockoutDetail,
  SeriesSummary,
} from './types';
import { getSeriesList, getSkusInSeries } from './aggregation';

const BUDGET_PENALTY_RATE = 0.5; // C4 SOFT：预算超支惩罚系数（元/元）

export function calculate(
  stage: 1 | 2,
  skuDecisions: SkuDecisions,
  transportModes: Record<string, Record<string, 'box' | 'pallet'>>,
  data: GameData
): CalculationResult {
  const { warehouses, stores, skus, direct_stores, supermarkets } = data;
  const seriesList = getSeriesList(data);

  // ─── Step 1: 汇总仓库发货量 ───────────────────────────────
  const shipped: Record<string, Record<string, number>> = {};
  const routeTotal: Record<string, Record<string, number>> = {};
  for (const wh of warehouses) {
    shipped[wh] = Object.fromEntries(skus.map(k => [k, 0]));
    routeTotal[wh] = Object.fromEntries(stores.map(s => [s, 0]));
    for (const store of stores) {
      for (const sku of skus) {
        const qty = skuDecisions[wh]?.[store]?.[sku] ?? 0;
        shipped[wh][sku] += qty;
        routeTotal[wh][store] += qty;
      }
    }
  }

  // ─── Step 2: 仓库月末剩余库存 F_{i,k} ─────────────────────
  const warehouseRemaining: Record<string, Record<string, number>> = {};
  for (const wh of warehouses) {
    warehouseRemaining[wh] = {};
    for (const sku of skus) {
      const wi = data.warehouse_inventory[wh]?.[sku] ?? 0;
      warehouseRemaining[wh][sku] = wi - shipped[wh][sku];
    }
  }

  // ─── Step 3: 门店可用量、缺货量、月末剩余 ─────────────────
  const storeShortage: Record<string, Record<string, number>> = {};
  const storeOverstock: Record<string, Record<string, number>> = {};
  for (const store of stores) {
    storeShortage[store] = {};
    storeOverstock[store] = {};
    for (const sku of skus) {
      const si = data.current_store_inventory[store]?.[sku] ?? 0;
      const received = warehouses.reduce(
        (sum, wh) => sum + (skuDecisions[wh]?.[store]?.[sku] ?? 0),
        0
      );
      const avail = si + received;
      const d = data.demand[store]?.[sku] ?? 0;
      storeShortage[store][sku] = Math.max(0, d - avail);
      storeOverstock[store][sku] = Math.max(0, avail - d);
    }
  }

  // ─── Step 4: 计算各项成本 ──────────────────────────────────

  // C_trans
  let cTrans = 0;
  const transByWarehouse: Record<string, number> = Object.fromEntries(warehouses.map(w => [w, 0]));
  const transByStore: Record<string, number> = Object.fromEntries(stores.map(s => [s, 0]));
  const boxMult = data.transport_modes.box.cost_multiplier;
  const palletMult = data.transport_modes.pallet.cost_multiplier;
  const palletMin = data.transport_modes.pallet.min_quantity;

  for (const wh of warehouses) {
    for (const store of stores) {
      const unitCost = data.transport_cost[wh]?.[store] ?? 0;
      const mode = transportModes[wh]?.[store] ?? 'box';
      const multiplier = mode === 'pallet' ? palletMult : boxMult;
      const routeQty = routeTotal[wh][store];
      const routeCost = routeQty * unitCost * multiplier;
      cTrans += routeCost;
      transByWarehouse[wh] += routeCost;
      transByStore[store] += routeCost;
    }
  }

  // C_short
  let cShort = 0;
  const stockoutDetails: StockoutDetail[] = [];
  for (const store of stores) {
    for (const sku of skus) {
      const shortage = storeShortage[store][sku];
      if (shortage > 1e-6) {
        const gamma = data.sku_penalty[sku] ?? 0;
        const cost = shortage * gamma;
        cShort += cost;
        stockoutDetails.push({
          store,
          sku,
          series: data.sku_series[sku] ?? '',
          demand: data.demand[store]?.[sku] ?? 0,
          current_inventory: data.current_store_inventory[store]?.[sku] ?? 0,
          received: warehouses.reduce((s, wh) => s + (skuDecisions[wh]?.[store]?.[sku] ?? 0), 0),
          shortfall: Math.round(shortage * 100) / 100,
          penalty_per_unit: gamma,
          stockout_cost: Math.round(cost * 100) / 100,
        });
      }
    }
  }

  // C_hold（门店持货 + 仓库持货）
  let cHoldStore = 0;
  for (const store of stores) {
    for (const sku of skus) {
      const h = data.store_holding_cost[sku] ?? 0.5;
      cHoldStore += h * storeOverstock[store][sku];
    }
  }
  let cHoldWarehouse = 0;
  for (const wh of warehouses) {
    for (const sku of skus) {
      const f = Math.max(0, warehouseRemaining[wh][sku]);
      cHoldWarehouse += data.warehouse_holding_cost * f;
    }
  }
  const cHold = cHoldStore + cHoldWarehouse;

  // C_pen（SOFT约束惩罚）
  let cPen = 0;

  // ─── Step 5: 约束检查 ──────────────────────────────────────
  const errors: string[] = [];
  const warnings: string[] = [];
  const violations: string[] = [];
  const constraintStatus: Record<string, ConstraintStatus> = {};

  // C1 (HARD)：仓库库存约束
  let c1Ok = true;
  const c1Details: ConstraintStatus['details'] = [];
  for (const wh of warehouses) {
    for (const sku of skus) {
      const wi = data.warehouse_inventory[wh]?.[sku] ?? 0;
      const sent = shipped[wh][sku];
      if (sent > wi + 1e-6) {
        c1Ok = false;
        const excess = sent - wi;
        c1Details.push({ warehouse: wh, sku, available: wi, shipped: Math.round(sent), excess: Math.round(excess) });
        const msg = `[C1违反] ${wh} 的 ${sku}：发货 ${Math.round(sent)} 件，超出库存 ${wi} 件`;
        violations.push(msg);
        errors.push(msg);
      }
    }
  }
  constraintStatus['C1'] = { name: '仓库库存约束', mode: 'HARD', satisfied: c1Ok, details: c1Details };

  // C2：安全库存约束（第一轮SOFT，第二轮HARD）
  let c2Ok = true;
  const c2Details: ConstraintStatus['details'] = [];
  let c2Penalty = 0;
  for (const wh of warehouses) {
    for (const sku of skus) {
      const wl = data.safety_stock[wh]?.[sku] ?? 0;
      const f = warehouseRemaining[wh][sku];
      const violation = Math.max(0, wl - f);
      if (violation > 1e-6) {
        if (stage === 2) {
          c2Ok = false;
          const msg = `[C2违反] ${wh} 的 ${sku}：月末库存 ${Math.round(f)} 件 < 安全库存 ${wl} 件`;
          violations.push(msg);
          errors.push(msg);
        } else {
          c2Penalty += data.safety_stock_penalty * violation;
          const msg = `[C2警告] ${wh} 的 ${sku}：月末库存 ${Math.round(f)} 件 < 安全库存 ${wl} 件（软约束，计入惩罚）`;
          warnings.push(msg);
        }
        c2Details.push({ warehouse: wh, sku, safety_stock: wl, remaining: Math.round(f * 100) / 100, violation: Math.round(violation * 100) / 100 });
      }
    }
  }
  cPen += c2Penalty;
  constraintStatus['C2'] = {
    name: '仓库安全库存约束',
    mode: stage === 2 ? 'HARD（第二轮）' : 'SOFT（第一轮）',
    satisfied: stage === 2 ? c2Ok : true,
    details: c2Details,
    penalty: Math.round(c2Penalty * 100) / 100,
  };

  // C3 (HARD)：直营店仓储容量（第二轮）
  let c3Ok = true;
  const c3Details: ConstraintStatus['details'] = [];
  if (stage === 2) {
    for (const store of direct_stores) {
      const dc = data.direct_store_constraints[store]?.storage_capacity ?? Infinity;
      const totalOverstock = skus.reduce((sum, sku) => sum + storeOverstock[store][sku], 0);
      if (totalOverstock > dc + 1e-6) {
        c3Ok = false;
        const excess = totalOverstock - dc;
        c3Details.push({ store, capacity: dc, overstock: Math.round(totalOverstock), excess: Math.round(excess) });
        const msg = `[C3违反] ${store}：月末剩余库存 ${Math.round(totalOverstock)} 件 > 仓储容量 ${dc} 件`;
        violations.push(msg);
        errors.push(msg);
      }
    }
  }
  constraintStatus['C3'] = { name: '直营店仓储容量约束', mode: 'HARD（第二轮）', satisfied: c3Ok, details: c3Details };

  // C4 (SOFT)：直营店进货预算（第二轮）
  let c4Ok = true;
  const c4Details: ConstraintStatus['details'] = [];
  if (stage === 2) {
    for (const store of direct_stores) {
      const db = data.direct_store_constraints[store]?.monthly_budget ?? Infinity;
      const storeTransCost = warehouses.reduce(
        (sum, wh) =>
          sum +
          skus.reduce(
            (s2, sku) =>
              s2 + (skuDecisions[wh]?.[store]?.[sku] ?? 0) * (data.transport_cost[wh]?.[store] ?? 0),
            0
          ),
        0
      );
      const violation = Math.max(0, storeTransCost - db);
      if (violation > 1e-6) {
        c4Ok = false;
        const penalty = BUDGET_PENALTY_RATE * violation;
        cPen += penalty;
        c4Details.push({ store, budget: db, actual_cost: Math.round(storeTransCost * 100) / 100, violation: Math.round(violation * 100) / 100, penalty: Math.round(penalty * 100) / 100 });
        const msg = `[C4警告] ${store}：进货运输成本 ¥${storeTransCost.toFixed(2)} > 月度预算 ¥${db}（软约束，计入惩罚）`;
        warnings.push(msg);
      }
    }
  }
  constraintStatus['C4'] = { name: '直营店进货预算约束', mode: 'SOFT（第二轮）', satisfied: c4Ok, details: c4Details };

  // C5 (HARD)：商超进货上限（第二轮）
  let c5Ok = true;
  const c5Details: ConstraintStatus['details'] = [];
  if (stage === 2) {
    for (const store of supermarkets) {
      const ns = data.supermarket_constraints[store]?.monthly_order_limit ?? Infinity;
      const totalReceived = warehouses.reduce(
        (sum, wh) => sum + skus.reduce((s2, sku) => s2 + (skuDecisions[wh]?.[store]?.[sku] ?? 0), 0),
        0
      );
      if (totalReceived > ns + 1e-6) {
        c5Ok = false;
        const excess = totalReceived - ns;
        c5Details.push({ store, limit: ns, ordered: Math.round(totalReceived), excess: Math.round(excess) });
        const msg = `[C5违反] ${store}：本月进货 ${Math.round(totalReceived)} 件 > 进货上限 ${ns} 件`;
        violations.push(msg);
        errors.push(msg);
      }
    }
  }
  constraintStatus['C5'] = { name: '商超进货上限约束', mode: 'HARD（第二轮）', satisfied: c5Ok, details: c5Details };

  // 托盘运输最低量约束（第二轮）
  let palletOk = true;
  const palletDetails: ConstraintStatus['details'] = [];
  if (stage === 2) {
    for (const wh of warehouses) {
      for (const store of stores) {
        const mode = transportModes[wh]?.[store] ?? 'box';
        if (mode === 'pallet') {
          const totalQty = routeTotal[wh][store];
          if (totalQty > 1e-6 && totalQty < palletMin - 1e-6) {
            palletOk = false;
            palletDetails.push({ warehouse: wh, store, quantity: Math.round(totalQty), min_required: palletMin });
            const msg = `[运输方式违反] ${wh}→${store}：托盘运输但发货量 ${Math.round(totalQty)} 件 < 最低 ${palletMin} 件`;
            violations.push(msg);
            errors.push(msg);
          }
        }
      }
    }
  }
  constraintStatus['pallet_min'] = { name: '托盘运输最低起运量约束', mode: 'HARD（第二轮）', satisfied: palletOk, details: palletDetails };

  const isValid = c1Ok && (stage === 2 ? c2Ok : true) && (stage === 2 ? c3Ok : true) && (stage === 2 ? c5Ok : true) && (stage === 2 ? palletOk : true);

  const cTotal = cTrans + cShort + cHold + cPen;

  const costSummary: CostSummary = {
    c_trans: Math.round(cTrans * 100) / 100,
    c_short: Math.round(cShort * 100) / 100,
    c_hold: Math.round(cHold * 100) / 100,
    c_hold_store: Math.round(cHoldStore * 100) / 100,
    c_hold_warehouse: Math.round(cHoldWarehouse * 100) / 100,
    c_pen: Math.round(cPen * 100) / 100,
    c_total: Math.round(cTotal * 100) / 100,
  };

  // ─── Step 6: 门店满足率 ────────────────────────────────────
  const storeFulfillment: Record<string, StoreFulfillment> = {};
  for (const store of stores) {
    const totalDemand = skus.reduce((sum, sku) => sum + (data.demand[store]?.[sku] ?? 0), 0);
    const totalShortage = skus.reduce((sum, sku) => sum + storeShortage[store][sku], 0);
    const fulfilled = totalDemand - totalShortage;
    storeFulfillment[store] = {
      total_demand: totalDemand,
      total_fulfilled: Math.round(fulfilled * 100) / 100,
      fulfillment_rate: totalDemand > 0 ? Math.round((fulfilled / totalDemand) * 1000) / 10 : 100,
    };
  }

  // ─── Step 7: 仓库使用情况 ──────────────────────────────────
  const inventoryUsage: Record<string, InventoryUsage> = {};
  for (const wh of warehouses) {
    const totalInv = skus.reduce((sum, sku) => sum + (data.warehouse_inventory[wh]?.[sku] ?? 0), 0);
    const totalShipped = skus.reduce((sum, sku) => sum + shipped[wh][sku], 0);
    const totalRemaining = skus.reduce((sum, sku) => sum + Math.max(0, warehouseRemaining[wh][sku]), 0);
    const totalSafety = skus.reduce((sum, sku) => sum + (data.safety_stock[wh]?.[sku] ?? 0), 0);
    inventoryUsage[wh] = {
      total_available: totalInv,
      total_sent: Math.round(totalShipped * 100) / 100,
      total_remaining: Math.round(totalRemaining * 100) / 100,
      total_safety_stock: totalSafety,
      utilization_rate: totalInv > 0 ? Math.round((totalShipped / totalInv) * 1000) / 10 : 0,
    };
  }

  // ─── Step 8: 系列级聚合摘要 ────────────────────────────────
  const seriesSummary: SeriesSummary[] = seriesList.map(series => {
    const skusInSeries = getSkusInSeries(data, series);
    let totalDemand = 0, totalReceived = 0, totalShortage = 0, shortageCost = 0, holdCost = 0;
    for (const store of stores) {
      for (const sku of skusInSeries) {
        const d = data.demand[store]?.[sku] ?? 0;
        const recv = warehouses.reduce((s, wh) => s + (skuDecisions[wh]?.[store]?.[sku] ?? 0), 0);
        const si = data.current_store_inventory[store]?.[sku] ?? 0;
        const shortage = storeShortage[store][sku];
        const overstock = storeOverstock[store][sku];
        totalDemand += d;
        totalReceived += recv + si;
        totalShortage += shortage;
        shortageCost += shortage * (data.sku_penalty[sku] ?? 0);
        holdCost += overstock * (data.store_holding_cost[sku] ?? 0.5);
      }
    }
    return {
      series,
      total_demand: totalDemand,
      total_received: totalReceived,
      total_shortage: Math.round(totalShortage),
      shortage_cost: Math.round(shortageCost * 100) / 100,
      hold_cost: Math.round(holdCost * 100) / 100,
    };
  });

  // ─── Step 9: 门店组满足率 ──────────────────────────────────
  const groupFulfillment: Record<string, { rate: number; fulfilled: number; demand: number }> = {};
  for (const group of ['直营组', '商超组']) {
    const groupStores = group === '直营组' ? direct_stores : supermarkets;
    let totalDemand = 0, totalFulfilled = 0;
    for (const store of groupStores) {
      totalDemand += storeFulfillment[store].total_demand;
      totalFulfilled += storeFulfillment[store].total_fulfilled;
    }
    groupFulfillment[group] = {
      demand: totalDemand,
      fulfilled: Math.round(totalFulfilled),
      rate: totalDemand > 0 ? Math.round((totalFulfilled / totalDemand) * 1000) / 10 : 100,
    };
  }

  return {
    stage,
    valid: isValid,
    errors,
    warnings,
    violations,
    cost_summary: costSummary,
    constraint_status: constraintStatus,
    store_fulfillment: storeFulfillment,
    inventory_usage: inventoryUsage,
    stockout_details: stockoutDetails,
    warehouse_remaining: Object.fromEntries(
      warehouses.map(wh => [wh, Object.fromEntries(skus.map(sku => [sku, Math.round(warehouseRemaining[wh][sku] * 100) / 100]))])
    ),
    series_summary: seriesSummary,
    group_fulfillment: groupFulfillment,
  };
}
