/**
 * Home.tsx — 库存运输决策教学游戏主界面
 * 
 * 设计语言：工业运营仪表盘（深色主题）
 * 决策层：系列级 × 门店组级（降维后 3仓库 × 2门店组 × 6系列 = 36个决策点）
 * 后台：完整 SKU×门店 计算（3×10×30）
 */

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  RAW_GAME_DATA,
  calculate,
  expandDecisions,
  expandTransportModes,
  getSuggestedDecisions,
  getSeriesList,
  aggregateWarehouseInventory,
  aggregateSafetyStock,
  aggregateGroupDemand,
  aggregateGroupCurrentInventory,
  SERIES_COLORS,
  SERIES_ICONS,
  STORE_GROUP_COLORS,
  type GameData,
  type SeriesGroupDecisions,
  type TransportModeDecisions,
  type CalculationResult,
} from '@/lib/game';

const DATA = RAW_GAME_DATA as unknown as GameData;

// ─── 子组件：顶部 HUD ──────────────────────────────────────────
function GameHUD({ stage, round }: { stage: 1 | 2; round: string }) {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
          <span className="text-primary text-sm font-bold">📦</span>
        </div>
        <div>
          <h1 className="text-sm font-semibold text-foreground leading-none">库存运输决策教学游戏</h1>
          <p className="text-xs text-muted-foreground mt-0.5">多仓库 · 多门店 · 多SKU</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`px-3 py-1 rounded-full text-xs font-mono font-semibold border ${
          stage === 1
            ? 'bg-primary/10 text-primary border-primary/30'
            : 'bg-amber-400/10 text-amber-400 border-amber-400/30'
        }`}>
          {round}
        </span>
        <span className="text-xs text-muted-foreground hidden sm:block">
          3仓库 × 2门店组 × 6系列
        </span>
      </div>
    </div>
  );
}

// ─── 子组件：仓库库存卡片 ──────────────────────────────────────
function WarehousePanel({ stage }: { stage: 1 | 2 }) {
  const seriesList = useMemo(() => getSeriesList(DATA), []);
  const whInv = useMemo(() => aggregateWarehouseInventory(DATA), []);
  const whSafety = useMemo(() => aggregateSafetyStock(DATA), []);

  return (
    <div className="game-card">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-primary text-base">🏭</span>
        <h2 className="text-sm font-semibold text-foreground">仓库可用库存</h2>
        {stage === 2 && (
          <span className="ml-auto text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
            第二轮：需保留安全库存
          </span>
        )}
      </div>
      <div className="space-y-3">
        {DATA.warehouses.map(wh => {
          const totalInv = seriesList.reduce((s, sr) => s + (whInv[wh]?.[sr] ?? 0), 0);
          const totalSafety = seriesList.reduce((s, sr) => s + (whSafety[wh]?.[sr] ?? 0), 0);
          const usable = stage === 2 ? Math.max(0, totalInv - totalSafety) : totalInv;
          const pct = totalInv > 0 ? (usable / totalInv) * 100 : 0;
          return (
            <div key={wh} className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground truncate max-w-[120px]">{wh}</span>
                <span className="font-mono text-xs text-foreground">
                  <span className="text-primary font-semibold">{usable.toLocaleString()}</span>
                  <span className="text-muted-foreground">/{totalInv.toLocaleString()}</span>
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${pct}%`,
                    background: pct > 60 ? '#22c55e' : pct > 30 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
              {stage === 2 && (
                <div className="text-xs text-amber-400/70">安全库存下限：{totalSafety.toLocaleString()} 件</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 子组件：门店组需求卡片 ────────────────────────────────────
function DemandPanel() {
  const seriesList = useMemo(() => getSeriesList(DATA), []);
  const groupDemand = useMemo(() => aggregateGroupDemand(DATA), []);
  const groupInv = useMemo(() => aggregateGroupCurrentInventory(DATA), []);

  return (
    <div className="game-card">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-primary text-base">🏪</span>
        <h2 className="text-sm font-semibold text-foreground">门店需求概览</h2>
      </div>
      <div className="space-y-4">
        {['直营组', '商超组'].map(group => {
          const totalDemand = seriesList.reduce((s, sr) => s + (groupDemand[group]?.[sr] ?? 0), 0);
          const totalInv = seriesList.reduce((s, sr) => s + (groupInv[group]?.[sr] ?? 0), 0);
          const netNeed = Math.max(0, totalDemand - totalInv);
          return (
            <div key={group}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: STORE_GROUP_COLORS[group as keyof typeof STORE_GROUP_COLORS] }}
                  />
                  <span className="text-xs font-medium text-foreground">{group}</span>
                  <span className="text-xs text-muted-foreground">
                    ({group === '直营组' ? '3家' : '7家'})
                  </span>
                </div>
                <span className="font-mono text-xs text-foreground">
                  净需求 <span className="text-primary font-semibold">{netNeed.toLocaleString()}</span> 件
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {seriesList
                  .filter(sr => !(group === '商超组' && sr === '节日礼盒系列(直营店特供)'))
                  .map(sr => {
                    const d = groupDemand[group]?.[sr] ?? 0;
                    const inv = groupInv[group]?.[sr] ?? 0;
                    const net = Math.max(0, d - inv);
                    return (
                      <div
                        key={sr}
                        className="rounded px-1.5 py-1 text-center"
                        style={{ background: `${SERIES_COLORS[sr]}15`, border: `1px solid ${SERIES_COLORS[sr]}30` }}
                      >
                        <div className="text-xs" style={{ color: SERIES_COLORS[sr] }}>
                          {SERIES_ICONS[sr]}
                        </div>
                        <div className="font-mono text-xs text-foreground font-semibold">{net}</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 子组件：决策输入表格 ──────────────────────────────────────
function DecisionTable({
  stage,
  decisions,
  transportModes,
  onChange,
  onModeChange,
}: {
  stage: 1 | 2;
  decisions: SeriesGroupDecisions;
  transportModes: TransportModeDecisions;
  onChange: (wh: string, group: string, series: string, val: number) => void;
  onModeChange: (wh: string, group: string, mode: 'box' | 'pallet') => void;
}) {
  const seriesList = useMemo(() => getSeriesList(DATA), []);
  const whInv = useMemo(() => aggregateWarehouseInventory(DATA), []);
  const whSafety = useMemo(() => aggregateSafetyStock(DATA), []);
  const groups = ['直营组', '商超组'];

  // 计算各仓库已分配量（系列维度）
  const allocated = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const wh of DATA.warehouses) {
      result[wh] = {};
      for (const series of seriesList) {
        result[wh][series] = groups.reduce(
          (sum, g) => sum + (decisions[wh]?.[g]?.[series] ?? 0),
          0
        );
      }
    }
    return result;
  }, [decisions, seriesList]);

  return (
    <div className="game-card overflow-x-auto">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-primary text-base">📋</span>
        <h2 className="text-sm font-semibold text-foreground">配送决策</h2>
        <span className="text-xs text-muted-foreground ml-1">（单位：件）</span>
        {stage === 2 && (
          <span className="ml-auto text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
            第二轮新增约束已激活
          </span>
        )}
      </div>

      <div className="min-w-[700px]">
        {/* 表头 */}
        <div className="grid grid-cols-[140px_1fr] gap-2 mb-2">
          <div />
          <div className="grid grid-cols-6 gap-1">
            {seriesList.map(series => (
              <div
                key={series}
                className="text-center text-xs font-medium py-1 px-1 rounded"
                style={{ color: SERIES_COLORS[series], background: `${SERIES_COLORS[series]}15` }}
              >
                <div>{SERIES_ICONS[series]}</div>
                <div className="truncate text-[10px] leading-tight mt-0.5">
                  {series.replace('系列(直营店特供)', '').replace('系列', '')}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 仓库 × 门店组 行 */}
        {DATA.warehouses.map(wh => (
          <div key={wh} className="mb-4">
            {/* 仓库标题行 */}
            <div className="flex items-center gap-2 mb-2 py-1 border-b border-border/50">
              <span className="text-xs font-semibold text-primary w-[140px] truncate">{wh}</span>
              <div className="grid grid-cols-6 gap-1 flex-1">
                {seriesList.map(series => {
                  const inv = whInv[wh]?.[series] ?? 0;
                  const safety = whSafety[wh]?.[series] ?? 0;
                  const usable = stage === 2 ? Math.max(0, inv - safety) : inv;
                  const alloc = allocated[wh]?.[series] ?? 0;
                  const remaining = usable - alloc;
                  const isOver = remaining < -1e-6;
                  return (
                    <div key={series} className="text-center">
                      <span
                        className={`font-mono text-[10px] ${isOver ? 'text-red-400 font-bold' : 'text-muted-foreground'}`}
                      >
                        余{Math.round(remaining)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 门店组行 */}
            {groups.map(group => (
              <div key={group} className="grid grid-cols-[140px_1fr] gap-2 mb-2 items-center">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: STORE_GROUP_COLORS[group as keyof typeof STORE_GROUP_COLORS] }}
                  />
                  <span className="text-xs text-muted-foreground">{group}</span>
                  {stage === 2 && (
                    <select
                      className="ml-auto text-[10px] bg-input border border-border rounded px-1 py-0.5 text-foreground"
                      value={transportModes[wh]?.[group] ?? 'box'}
                      onChange={e => onModeChange(wh, group, e.target.value as 'box' | 'pallet')}
                    >
                      <option value="box">📦箱</option>
                      <option value="pallet">🔲托</option>
                    </select>
                  )}
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {seriesList.map(series => {
                    const isDisabled = group === '商超组' && series === '节日礼盒系列(直营店特供)';
                    const val = decisions[wh]?.[group]?.[series] ?? 0;
                    const inv = whInv[wh]?.[series] ?? 0;
                    const safety = whSafety[wh]?.[series] ?? 0;
                    const usable = stage === 2 ? Math.max(0, inv - safety) : inv;
                    const alloc = allocated[wh]?.[series] ?? 0;
                    const remaining = usable - alloc;
                    const isOver = remaining < -1e-6;
                    return (
                      <input
                        key={series}
                        type="number"
                        min={0}
                        disabled={isDisabled}
                        value={isDisabled ? '' : val || ''}
                        placeholder={isDisabled ? '—' : '0'}
                        onChange={e => onChange(wh, group, series, Math.max(0, parseInt(e.target.value) || 0))}
                        className={`game-input text-center ${
                          isDisabled
                            ? 'opacity-20 cursor-not-allowed'
                            : isOver
                            ? 'border-red-500 text-red-400 bg-red-500/5'
                            : ''
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 子组件：第二轮约束面板 ────────────────────────────────────
function Stage2ConstraintsPanel() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="game-card border-amber-400/20">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-amber-400">⚡</span>
          <h2 className="text-sm font-semibold text-amber-400">第二轮新增约束</h2>
        </div>
        <span className="text-muted-foreground text-xs">{expanded ? '▲ 收起' : '▼ 展开'}</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 直营店约束 */}
                <div className="rounded border border-border p-3">
                  <div className="text-xs font-semibold text-foreground mb-2">直营店约束</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left pb-1">门店</th>
                        <th className="text-right pb-1">仓储容量</th>
                        <th className="text-right pb-1">月度预算</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DATA.direct_stores.map(store => {
                        const c = DATA.direct_store_constraints[store];
                        return (
                          <tr key={store} className="border-t border-border/30">
                            <td className="py-1 text-muted-foreground truncate max-w-[100px]">{store}</td>
                            <td className="py-1 text-right font-mono text-foreground">{c?.storage_capacity ?? '∞'}</td>
                            <td className="py-1 text-right font-mono text-foreground">¥{c?.monthly_budget?.toLocaleString() ?? '∞'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    C3(HARD)：月末库存≤仓储容量 | C4(SOFT)：运输成本≤月度预算
                  </div>
                </div>
                {/* 商超约束 */}
                <div className="rounded border border-border p-3">
                  <div className="text-xs font-semibold text-foreground mb-2">商超进货上限 (C5 HARD)</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left pb-1">门店</th>
                        <th className="text-right pb-1">月进货上限</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DATA.supermarkets.map(store => {
                        const c = DATA.supermarket_constraints[store];
                        return (
                          <tr key={store} className="border-t border-border/30">
                            <td className="py-1 text-muted-foreground truncate max-w-[120px]">{store}</td>
                            <td className="py-1 text-right font-mono text-foreground">{c?.monthly_order_limit ?? '∞'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {/* 运输方式说明 */}
              <div className="rounded border border-border p-3">
                <div className="text-xs font-semibold text-foreground mb-2">运输方式（第二轮可选）</div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="text-base">📦</span>
                    <div>
                      <div className="font-medium text-foreground">箱式运输</div>
                      <div className="text-muted-foreground">无最低量限制，成本系数 ×1.0</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-base">🔲</span>
                    <div>
                      <div className="font-medium text-amber-400">托盘运输</div>
                      <div className="text-muted-foreground">最低 50 件/路线，成本系数 ×0.85</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── 子组件：成本结果面板 ──────────────────────────────────────
function ResultPanel({
  result,
  stage,
  onNextStage,
}: {
  result: CalculationResult;
  stage: 1 | 2;
  onNextStage?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'series' | 'stores' | 'constraints' | 'details'>('overview');
  const cs = result.cost_summary;

  const costItems = [
    { label: '运输成本 C_trans', value: cs.c_trans, color: '#38bdf8', desc: '仓库→门店运输费用' },
    { label: '缺货成本 C_short', value: cs.c_short, color: '#ef4444', desc: '未满足需求的惩罚' },
    { label: '持货成本 C_hold', value: cs.c_hold, color: '#a78bfa', desc: '门店+仓库库存持有' },
    { label: '软约束惩罚 C_pen', value: cs.c_pen, color: '#f59e0b', desc: stage === 1 ? 'C2安全库存违反惩罚' : 'C2+C4约束违反惩罚' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="game-card"
    >
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <h2 className="text-sm font-semibold text-foreground">计算结果</h2>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
          result.valid
            ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/30'
            : 'bg-red-400/10 text-red-400 border-red-400/30 animate-pulse-border'
        }`}>
          {result.valid ? '✓ 所有硬约束满足' : `✗ ${result.errors.length} 项约束违反`}
        </div>
      </div>

      {/* 总成本 */}
      <div className="text-center py-4 mb-4 rounded-lg bg-primary/5 border border-primary/20">
        <div className="text-xs text-muted-foreground mb-1">总成本 C_total</div>
        <div className="font-mono text-3xl font-bold text-primary animate-count">
          ¥{cs.c_total.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      {/* 成本分解 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {costItems.map(item => (
          <div key={item.label} className="rounded-lg p-3 border border-border bg-card/50">
            <div className="text-[10px] text-muted-foreground mb-1">{item.label}</div>
            <div className="font-mono text-sm font-bold" style={{ color: item.color }}>
              ¥{item.value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</div>
          </div>
        ))}
      </div>

      {/* 标签页 */}
      <div className="flex gap-1 mb-3 border-b border-border">
        {(['overview', 'series', 'stores', 'constraints', 'details'] as const).map(tab => {
          const labels = { overview: '门店组满足率', series: '系列分析', stores: '仓库状态', constraints: '约束状态', details: '缺货明细' };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* 标签内容 */}
      <div className="min-h-[160px]">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-2 gap-3">
            {['直营组', '商超组'].map(group => {
              const gf = result.group_fulfillment[group];
              const rate = gf?.rate ?? 0;
              return (
                <div key={group} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: STORE_GROUP_COLORS[group as keyof typeof STORE_GROUP_COLORS] }} />
                    <span className="text-xs font-medium text-foreground">{group}</span>
                  </div>
                  <div className="font-mono text-2xl font-bold mb-1" style={{
                    color: rate >= 95 ? '#22c55e' : rate >= 80 ? '#f59e0b' : '#ef4444'
                  }}>
                    {rate}%
                  </div>
                  <div className="progress-bar mb-1">
                    <div className="progress-fill" style={{
                      width: `${rate}%`,
                      background: rate >= 95 ? '#22c55e' : rate >= 80 ? '#f59e0b' : '#ef4444',
                    }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    满足 {gf?.fulfilled?.toLocaleString()} / {gf?.demand?.toLocaleString()} 件
                  </div>
                </div>
              );
            })}
            {/* 各门店满足率 */}
            <div className="col-span-2">
              <div className="text-xs text-muted-foreground mb-2">各门店满足率</div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {DATA.stores.map(store => {
                  const sf = result.store_fulfillment[store];
                  const rate = sf?.fulfillment_rate ?? 0;
                  const isDirect = DATA.direct_stores.includes(store);
                  return (
                    <div key={store} className={`rounded p-2 border text-center ${
                      rate >= 95 ? 'border-emerald-400/30 bg-emerald-400/5' :
                      rate >= 80 ? 'border-amber-400/30 bg-amber-400/5' :
                      'border-red-400/30 bg-red-400/5'
                    }`}>
                      <div className="text-[10px] text-muted-foreground truncate">{store.replace('直营店', '').replace('超市', '').replace('(', '').replace(')', '')}</div>
                      <div className={`font-mono text-sm font-bold ${
                        rate >= 95 ? 'text-emerald-400' : rate >= 80 ? 'text-amber-400' : 'text-red-400'
                      }`}>{rate}%</div>
                      <div className="text-[9px] text-muted-foreground">{isDirect ? '直营' : '商超'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'series' && (
          <div className="space-y-2">
            {result.series_summary.map(s => {
              const rate = s.total_demand > 0 ? Math.round(((s.total_demand - s.total_shortage) / s.total_demand) * 1000) / 10 : 100;
              return (
                <div key={s.series} className="flex items-center gap-3 rounded p-2 border border-border/50">
                  <span className="text-lg w-7 text-center">{SERIES_ICONS[s.series]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium" style={{ color: SERIES_COLORS[s.series] }}>
                        {s.series.replace('系列(直营店特供)', '★').replace('系列', '')}
                      </span>
                      <span className="font-mono text-xs text-foreground">{rate}% 满足</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{
                        width: `${rate}%`,
                        background: SERIES_COLORS[s.series],
                      }} />
                    </div>
                    <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                      <span>缺货 {s.total_shortage} 件</span>
                      <span>缺货成本 ¥{s.shortage_cost.toFixed(0)}</span>
                      <span>持货成本 ¥{s.hold_cost.toFixed(0)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'stores' && (
          <div className="space-y-2">
            {DATA.warehouses.map(wh => {
              const usage = result.inventory_usage[wh];
              const c2 = result.constraint_status['C2'];
              const c2ViolWh = c2?.details?.filter(d => d.warehouse === wh) ?? [];
              return (
                <div key={wh} className="rounded border border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-foreground">{wh}</span>
                    <span className={`font-mono text-xs ${c2ViolWh.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {c2ViolWh.length > 0 ? `⚠ ${c2ViolWh.length} SKU低于安全库存` : '✓ 安全库存满足'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">月初库存</div>
                      <div className="font-mono font-semibold text-foreground">{usage?.total_available?.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">已发货</div>
                      <div className="font-mono font-semibold text-primary">{usage?.total_sent?.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">月末剩余</div>
                      <div className="font-mono font-semibold text-foreground">{usage?.total_remaining?.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="mt-2 progress-bar">
                    <div className="progress-fill" style={{
                      width: `${usage?.utilization_rate ?? 0}%`,
                      background: '#38bdf8',
                    }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    库存利用率 {usage?.utilization_rate}% | 安全库存下限 {usage?.total_safety_stock?.toLocaleString()} 件
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'constraints' && (
          <div className="space-y-2">
            {Object.entries(result.constraint_status).map(([key, status]) => (
              <div
                key={key}
                className={`rounded border p-3 ${
                  status.satisfied ? 'constraint-ok' : 'constraint-err'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold">{key}</span>
                    <span className="text-xs">{status.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] opacity-70">{status.mode}</span>
                    <span className="text-xs font-semibold">{status.satisfied ? '✓ 满足' : '✗ 违反'}</span>
                  </div>
                </div>
                {status.penalty !== undefined && status.penalty > 0 && (
                  <div className="text-[10px] mt-1 text-amber-400">惩罚成本：¥{status.penalty.toFixed(2)}</div>
                )}
                {!status.satisfied && status.details.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {status.details.slice(0, 3).map((d, i) => (
                      <div key={i} className="text-[10px] text-red-300 bg-red-400/5 rounded px-2 py-1">
                        {d.warehouse && `${d.warehouse} `}
                        {d.store && `${d.store} `}
                        {d.sku && `${d.sku} `}
                        {d.excess !== undefined && `超出 ${d.excess} 件`}
                        {d.violation !== undefined && `违反 ${d.violation} 件`}
                        {d.ordered !== undefined && d.limit !== undefined && `进货 ${d.ordered} > 上限 ${d.limit}`}
                      </div>
                    ))}
                    {status.details.length > 3 && (
                      <div className="text-[10px] text-muted-foreground">...还有 {status.details.length - 3} 条</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'details' && (
          <div>
            {result.stockout_details.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">🎉 无缺货记录</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-left py-1.5 pr-2">门店</th>
                      <th className="text-left py-1.5 pr-2">系列</th>
                      <th className="text-right py-1.5 pr-2">需求</th>
                      <th className="text-right py-1.5 pr-2">缺货</th>
                      <th className="text-right py-1.5">缺货成本</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.stockout_details.slice(0, 20).map((d, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-1 pr-2 text-muted-foreground truncate max-w-[80px]">{d.store}</td>
                        <td className="py-1 pr-2" style={{ color: SERIES_COLORS[d.series] }}>
                          {SERIES_ICONS[d.series]}{d.series.replace('系列(直营店特供)', '').replace('系列', '')}
                        </td>
                        <td className="py-1 pr-2 text-right font-mono text-foreground">{d.demand}</td>
                        <td className="py-1 pr-2 text-right font-mono text-red-400">{d.shortfall}</td>
                        <td className="py-1 text-right font-mono text-red-400">¥{d.stockout_cost.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.stockout_details.length > 20 && (
                  <div className="text-center text-xs text-muted-foreground mt-2">
                    共 {result.stockout_details.length} 条，显示前 20 条
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      {stage === 1 && result.valid && onNextStage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 p-3 rounded-lg bg-emerald-400/5 border border-emerald-400/20"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-emerald-400">✓ 第一轮决策完成！</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                点击进入第二轮，体验更多约束下的优化挑战
              </div>
            </div>
            <button
              onClick={onNextStage}
              className="px-4 py-2 bg-primary text-primary-foreground rounded text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              进入第二轮 →
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── 主组件 ────────────────────────────────────────────────────
export default function Home() {
  const [stage, setStage] = useState<1 | 2>(1);
  const [decisions, setDecisions] = useState<SeriesGroupDecisions>({});
  const [transportModes, setTransportModes] = useState<TransportModeDecisions>({});
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const seriesList = useMemo(() => getSeriesList(DATA), []);

  // 初始化空决策
  const emptyDecisions = useCallback((): SeriesGroupDecisions => {
    const d: SeriesGroupDecisions = {};
    for (const wh of DATA.warehouses) {
      d[wh] = {};
      for (const group of ['直营组', '商超组']) {
        d[wh][group] = {};
        for (const series of seriesList) {
          d[wh][group][series] = 0;
        }
      }
    }
    return d;
  }, [seriesList]);

  const emptyModes = useCallback((): TransportModeDecisions => {
    const m: TransportModeDecisions = {};
    for (const wh of DATA.warehouses) {
      m[wh] = { '直营组': 'box', '商超组': 'box' };
    }
    return m;
  }, []);

  const handleChange = useCallback((wh: string, group: string, series: string, val: number) => {
    setDecisions(prev => ({
      ...prev,
      [wh]: {
        ...(prev[wh] ?? {}),
        [group]: {
          ...(prev[wh]?.[group] ?? {}),
          [series]: val,
        },
      },
    }));
    setResult(null);
  }, []);

  const handleModeChange = useCallback((wh: string, group: string, mode: 'box' | 'pallet') => {
    setTransportModes(prev => ({
      ...prev,
      [wh]: { ...(prev[wh] ?? {}), [group]: mode },
    }));
    setResult(null);
  }, []);

  const handleSuggest = useCallback(() => {
    const { decisions: d, transportModes: m } = getSuggestedDecisions(DATA, stage);
    setDecisions(d);
    setTransportModes(m);
    setResult(null);
    toast.success('已填入参考建议量', { description: '基于贪心算法，按最低运输成本分配' });
  }, [stage]);

  const handleClear = useCallback(() => {
    setDecisions(emptyDecisions());
    setTransportModes(emptyModes());
    setResult(null);
  }, [emptyDecisions, emptyModes]);

  const handleCalculate = useCallback(() => {
    setIsCalculating(true);
    // 使用 setTimeout 避免阻塞 UI
    setTimeout(() => {
      try {
        const skuDecisions = expandDecisions(decisions, DATA);
        const storeModes = expandTransportModes(transportModes, DATA);
        const res = calculate(stage, skuDecisions, storeModes, DATA);
        setResult(res);
        if (res.valid) {
          toast.success(`计算完成，总成本 ¥${res.cost_summary.c_total.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`, {
            description: res.warnings.length > 0 ? `${res.warnings.length} 条软约束警告` : '所有约束满足',
          });
        } else {
          toast.error(`发现 ${res.errors.length} 条约束违反`, {
            description: res.errors[0],
          });
        }
      } catch (e) {
        toast.error('计算出错', { description: String(e) });
      } finally {
        setIsCalculating(false);
      }
    }, 50);
  }, [decisions, transportModes, stage]);

  const handleNextStage = useCallback(() => {
    setStage(2);
    setResult(null);
    toast.info('进入第二轮', { description: '新增直营店容量/预算约束、商超进货上限、运输方式选择' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const roundLabel = stage === 1 ? '第一轮：基础库存决策' : '第二轮：多约束优化';

  return (
    <div className="min-h-screen bg-background">
      <GameHUD stage={stage} round={roundLabel} />

      {/* 游戏说明横幅 */}
      <div className="bg-card/30 border-b border-border px-6 py-3">
        <p className="text-xs text-muted-foreground max-w-4xl">
          {stage === 1
            ? '🎯 目标：为上海3个仓库向10家门店分配饼干库存，最小化运输成本+缺货成本+持货成本。决策维度已聚合为「仓库×门店组×系列」，系统自动按需求比例拆分到SKU级别计算。'
            : '🎯 第二轮新增约束：直营店仓储容量(HARD)、月度预算(SOFT)、商超进货上限(HARD)、安全库存(HARD)、托盘运输最低量。体验多约束下的权衡决策。'}
        </p>
      </div>

      <div className="container py-4">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* 左侧信息面板 */}
          <div className="space-y-4">
            <WarehousePanel stage={stage} />
            <DemandPanel />
            {stage === 2 && <Stage2ConstraintsPanel />}
          </div>

          {/* 右侧决策区 */}
          <div className="space-y-4">
            {/* 操作按钮栏 */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleSuggest}
                className="px-4 py-2 bg-primary/10 text-primary border border-primary/30 rounded text-xs font-semibold hover:bg-primary/20 transition-colors"
              >
                💡 参考建议量
              </button>
              <button
                onClick={handleClear}
                className="px-4 py-2 bg-secondary text-secondary-foreground border border-border rounded text-xs font-semibold hover:bg-secondary/80 transition-colors"
              >
                🗑 全部清零
              </button>
              <div className="flex-1" />
              <button
                onClick={handleCalculate}
                disabled={isCalculating}
                className="px-6 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
              >
                {isCalculating ? (
                  <>
                    <span className="animate-spin">⟳</span> 计算中...
                  </>
                ) : (
                  <>▶ 计算总成本</>
                )}
              </button>
            </div>

            {/* 决策表格 */}
            <DecisionTable
              stage={stage}
              decisions={decisions}
              transportModes={transportModes}
              onChange={handleChange}
              onModeChange={handleModeChange}
            />

            {/* 结果面板 */}
            <AnimatePresence mode="wait">
              {result && (
                <ResultPanel
                  key={`result-${stage}`}
                  result={result}
                  stage={stage}
                  onNextStage={stage === 1 ? handleNextStage : undefined}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
