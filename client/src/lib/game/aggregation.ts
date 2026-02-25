/**
 * aggregation.ts
 * 降维聚合层：系列×门店组 ↔ SKU×门店
 * 
 * 核心原则：
 *   - 玩家在"系列级 × 门店组级"做决策
 *   - 系统自动按历史需求比例拆分到 SKU × 门店
 *   - 后台计算引擎始终使用完整 SKU × 门店 数据
 */

import type { GameData, SeriesGroupDecisions, SkuDecisions, TransportModeDecisions } from './types';

/** 获取系列列表（有序） */
export function getSeriesList(data: GameData): string[] {
  return Array.from(new Set(Object.values(data.sku_series))).sort();
}

/** 获取某系列下的所有SKU */
export function getSkusInSeries(data: GameData, series: string): string[] {
  return data.skus.filter(sku => data.sku_series[sku] === series);
}

/** 门店组定义 */
export const STORE_GROUPS: Record<string, string> = {
  '直营组': '直营组',
  '商超组': '商超组',
};

export function getStoresInGroup(data: GameData, group: string): string[] {
  if (group === '直营组') return data.direct_stores;
  if (group === '商超组') return data.supermarkets;
  return [];
}

/**
 * 计算仓库→门店组→系列 的聚合库存（用于展示）
 */
export function aggregateWarehouseInventory(
  data: GameData
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  const seriesList = getSeriesList(data);
  for (const wh of data.warehouses) {
    result[wh] = {};
    for (const series of seriesList) {
      const skus = getSkusInSeries(data, series);
      result[wh][series] = skus.reduce(
        (sum, sku) => sum + (data.warehouse_inventory[wh]?.[sku] ?? 0),
        0
      );
    }
  }
  return result;
}

/**
 * 计算仓库→系列 安全库存聚合
 */
export function aggregateSafetyStock(
  data: GameData
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  const seriesList = getSeriesList(data);
  for (const wh of data.warehouses) {
    result[wh] = {};
    for (const series of seriesList) {
      const skus = getSkusInSeries(data, series);
      result[wh][series] = skus.reduce(
        (sum, sku) => sum + (data.safety_stock[wh]?.[sku] ?? 0),
        0
      );
    }
  }
  return result;
}

/**
 * 计算门店组→系列 的聚合需求（用于展示）
 */
export function aggregateGroupDemand(
  data: GameData
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  const seriesList = getSeriesList(data);
  for (const group of ['直营组', '商超组']) {
    result[group] = {};
    const stores = getStoresInGroup(data, group);
    for (const series of seriesList) {
      const skus = getSkusInSeries(data, series);
      result[group][series] = stores.reduce(
        (sum, store) =>
          sum + skus.reduce((s2, sku) => s2 + (data.demand[store]?.[sku] ?? 0), 0),
        0
      );
    }
  }
  return result;
}

/**
 * 计算门店组→系列 的聚合当前库存（用于展示）
 */
export function aggregateGroupCurrentInventory(
  data: GameData
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  const seriesList = getSeriesList(data);
  for (const group of ['直营组', '商超组']) {
    result[group] = {};
    const stores = getStoresInGroup(data, group);
    for (const series of seriesList) {
      const skus = getSkusInSeries(data, series);
      result[group][series] = stores.reduce(
        (sum, store) =>
          sum + skus.reduce((s2, sku) => s2 + (data.current_store_inventory[store]?.[sku] ?? 0), 0),
        0
      );
    }
  }
  return result;
}

/**
 * 将玩家的「系列×门店组」决策展开为「SKU×门店」决策
 * 
 * 拆分规则：
 *   1. 门店拆分：按各门店在该系列的历史需求比例分配
 *   2. SKU拆分：按各SKU在该系列中的历史需求比例分配
 *   3. 若某门店/SKU需求为0，则按等比例分配
 */
export function expandDecisions(
  seriesGroupDecisions: SeriesGroupDecisions,
  data: GameData
): SkuDecisions {
  const skuDecisions: SkuDecisions = {};

  // 初始化
  for (const wh of data.warehouses) {
    skuDecisions[wh] = {};
    for (const store of data.stores) {
      skuDecisions[wh][store] = {};
      for (const sku of data.skus) {
        skuDecisions[wh][store][sku] = 0;
      }
    }
  }

  const seriesList = getSeriesList(data);

  for (const wh of data.warehouses) {
    for (const group of ['直营组', '商超组']) {
      const storesInGroup = getStoresInGroup(data, group);
      for (const series of seriesList) {
        const qty = seriesGroupDecisions[wh]?.[group]?.[series] ?? 0;
        if (qty <= 0) continue;

        const skusInSeries = getSkusInSeries(data, series);

        // 计算门店需求总量（用于比例分配）
        const storeDemandTotal: Record<string, number> = {};
        let totalStoreDemand = 0;
        for (const store of storesInGroup) {
          const d = skusInSeries.reduce(
            (sum, sku) => sum + (data.demand[store]?.[sku] ?? 0),
            0
          );
          storeDemandTotal[store] = d;
          totalStoreDemand += d;
        }

        // 计算SKU需求总量（用于比例分配）
        const skuDemandTotal: Record<string, number> = {};
        let totalSkuDemand = 0;
        for (const sku of skusInSeries) {
          const d = storesInGroup.reduce(
            (sum, store) => sum + (data.demand[store]?.[sku] ?? 0),
            0
          );
          skuDemandTotal[sku] = d;
          totalSkuDemand += d;
        }

        for (const store of storesInGroup) {
          // 门店分配比例
          const storeRatio =
            totalStoreDemand > 0
              ? storeDemandTotal[store] / totalStoreDemand
              : 1 / storesInGroup.length;
          const storeQty = qty * storeRatio;

          for (const sku of skusInSeries) {
            // SKU分配比例
            const skuRatio =
              totalSkuDemand > 0
                ? skuDemandTotal[sku] / totalSkuDemand
                : 1 / skusInSeries.length;
            const skuQty = Math.round(storeQty * skuRatio);
            skuDecisions[wh][store][sku] += skuQty;
          }
        }
      }
    }
  }

  // 截断：确保各仓库各SKU总发货量不超过库存上限（修正舍入误差）
  for (const wh of data.warehouses) {
    for (const sku of data.skus) {
      const maxAvail = data.warehouse_inventory[wh]?.[sku] ?? 0;
      let totalSent = 0;
      for (const store of data.stores) {
        totalSent += skuDecisions[wh][store][sku];
      }
      if (totalSent > maxAvail) {
        // 按比例缩减
        const scale = maxAvail / totalSent;
        let remaining = maxAvail;
        const storeList = [...data.stores];
        for (let i = 0; i < storeList.length; i++) {
          const store = storeList[i];
          if (i === storeList.length - 1) {
            // 最后一个门店取剩余量
            skuDecisions[wh][store][sku] = Math.max(0, remaining);
          } else {
            const scaled = Math.floor(skuDecisions[wh][store][sku] * scale);
            skuDecisions[wh][store][sku] = scaled;
            remaining -= scaled;
          }
        }
      }
    }
  }

  return skuDecisions;
}

/**
 * 将玩家的「门店组」运输方式决策展开为「门店」级运输方式
 */
export function expandTransportModes(
  groupModes: TransportModeDecisions,
  data: GameData
): Record<string, Record<string, 'box' | 'pallet'>> {
  const result: Record<string, Record<string, 'box' | 'pallet'>> = {};
  for (const wh of data.warehouses) {
    result[wh] = {};
    for (const group of ['直营组', '商超组']) {
      const mode = groupModes[wh]?.[group] ?? 'box';
      for (const store of getStoresInGroup(data, group)) {
        result[wh][store] = mode;
      }
    }
  }
  return result;
}

/**
 * 生成参考建议量（系列×门店组级）
 * 策略：满足净需求，第二轮保留安全库存
 */
export function getSuggestedDecisions(
  data: GameData,
  stage: 1 | 2
): { decisions: SeriesGroupDecisions; transportModes: TransportModeDecisions } {
  const seriesList = getSeriesList(data);
  const groupDemand = aggregateGroupDemand(data);
  const groupCurrentInv = aggregateGroupCurrentInventory(data);
  const whSeriesInv = aggregateWarehouseInventory(data);
  const whSeriesSafety = aggregateSafetyStock(data);

  // 可用库存（第二轮扣除安全库存）
  const available: Record<string, Record<string, number>> = {};
  for (const wh of data.warehouses) {
    available[wh] = {};
    for (const series of seriesList) {
      const inv = whSeriesInv[wh][series] ?? 0;
      const safety = stage === 2 ? (whSeriesSafety[wh][series] ?? 0) : 0;
      available[wh][series] = Math.max(0, inv - safety);
    }
  }

  const decisions: SeriesGroupDecisions = {};
  const transportModes: TransportModeDecisions = {};

  for (const wh of data.warehouses) {
    decisions[wh] = {};
    transportModes[wh] = {};
    for (const group of ['直营组', '商超组']) {
      decisions[wh][group] = {};
      transportModes[wh][group] = 'box';
    }
  }

  // 按运输成本从低到高排序仓库
  const groups = ['直营组', '商超组'];
  for (const group of groups) {
    const storesInGroup = getStoresInGroup(data, group);
    for (const series of seriesList) {
      // 商超不配送节日礼盒
      if (group === '商超组' && series === '节日礼盒系列(直营店特供)') continue;

      const currentInv = groupCurrentInv[group][series] ?? 0;
      const demand = groupDemand[group][series] ?? 0;
      let netNeed = Math.max(0, demand - currentInv);

      // 按运输成本排序仓库（取门店组平均成本）
      const sortedWarehouses = [...data.warehouses].sort((a, b) => {
        const costA =
          storesInGroup.reduce((s, st) => s + (data.transport_cost[a]?.[st] ?? 9999), 0) /
          storesInGroup.length;
        const costB =
          storesInGroup.reduce((s, st) => s + (data.transport_cost[b]?.[st] ?? 9999), 0) /
          storesInGroup.length;
        return costA - costB;
      });

      for (const wh of sortedWarehouses) {
        if (netNeed <= 0) break;
        const canSend = Math.min(netNeed, available[wh][series]);
        decisions[wh][group][series] = (decisions[wh][group][series] ?? 0) + canSend;
        available[wh][series] -= canSend;
        netNeed -= canSend;
      }
    }
  }

  // 确定运输方式（总量≥50件用托盘）
  for (const wh of data.warehouses) {
    for (const group of groups) {
      const totalQty = seriesList.reduce(
        (sum, series) => sum + (decisions[wh][group][series] ?? 0),
        0
      );
      transportModes[wh][group] = totalQty >= 50 ? 'pallet' : 'box';
    }
  }

  return { decisions, transportModes };
}
