/**
 * Home.tsx — 库存运输决策教学游戏主界面
 *
 * 设计语言：白色背景亮色主题（第一版风格）
 * 决策层：系列级 × 门店组级（降维后 3仓库 × 2门店组 × 6系列 = 36个决策点）
 * 后台：完整 SKU×门店 计算（3×10×30）
 */
import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart,
  Line,
  ResponsiveContainer,
} from 'recharts';
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

// ─── 游戏决策使用的2个系列（精致甜点+经典夹心，受第二轮约束影响最大）
const VISIBLE_SERIES = ['精致甜点系列', '经典夹心系列'];

// ─── 游戏决策使用的2个门店（1个直营+1个商超）
const VISIBLE_STORES = ['南京东路直营店', '大象超市(长宁店)'];

// ─── 界面可见仓库（只展示前两个，松江物流园不在决策界面显示）
const VISIBLE_WAREHOUSES = ['上海奉贤仓储中心', '嘉定配送中心'];

/// ─── 图表展示用的全部6个系列
const ALL_SERIES_FOR_CHART = ['精致甜点系列', '经典夹心系列', '营养谷物系列', '无糖系列', '儿童系列', '节日礼盒系列(直营店特供)'];

// ─── 仓库库存柱状图数据（使用全部3个仓库、6个系列完整数据）
function useWarehouseChartData() {
  return useMemo(() => {
    const whInv = aggregateWarehouseInventory(DATA);
    return DATA.warehouses.map(wh => {
      const row: Record<string, string | number> = { name: wh };
      for (const series of ALL_SERIES_FOR_CHART) {
        row[series] = whInv[wh]?.[series] ?? 0;
      }
      return row;
    });
  }, []);
}

// ─── 门店需求柱状图数据 ──────────────────────────────────────
function useStoreChartData() {
  return useMemo(() => {
    return DATA.stores.map(store => {
      const demand = Object.values(DATA.demand[store] ?? {}).reduce((s, v) => s + v, 0);
      const inv = Object.values(DATA.current_store_inventory[store] ?? {}).reduce((s, v) => s + v, 0);
      const shortName = store
        .replace('直营店', '')
        .replace('超市', '')
        .replace('(', '(')
        .replace(')', ')');
      return { name: shortName, 月需求量: demand, 当前库存: inv };
    });
  }, []);
}

// ─── 子组件：顶部导航栏 ──────────────────────────────────────
function TopNav({ stage, round }: { stage: 1 | 2; round: string }) {
  return (
    <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-xl">📦</span>
        <div>
          <h1 className="text-sm font-bold text-gray-900 leading-none">库存运输决策教学游戏</h1>
          <p className="text-xs text-gray-500 mt-0.5">多仓库 · 多门店 · 多SKU</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold border ${
            stage === 1
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
        >
          {round}
        </span>
        <a
          href="/files"
          className="px-3 py-1 rounded border border-gray-200 text-xs text-gray-500 hover:text-gray-800 hover:border-blue-300 transition-colors flex items-center gap-1"
        >
          <span>📁</span>
          <span className="hidden sm:inline">文件库</span>
        </a>
      </div>
    </div>
  );
}

// ─── 子组件：Hero 横幅 ──────────────────────────────────────
function HeroBanner({ stage }: { stage: 1 | 2 }) {
  return (
    <div
      className="relative overflow-hidden px-8 py-8"
      style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 30%, #0891b2 70%, #0d9488 100%)',
      }}
    >
      {/* 装饰圆形 */}
      <div
        className="absolute top-[-60px] right-[-60px] w-48 h-48 rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-[-40px] left-[30%] w-32 h-32 rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
      />

      <h2 className="text-2xl font-bold text-white mb-4">欢迎来到库存运输决策挑战</h2>

      <div className="bg-white/15 backdrop-blur-sm rounded-xl px-5 py-4 mb-6 max-w-3xl">
        <p className="text-white/90 text-sm leading-relaxed">
          你的目标 🎯：在满足限制要求的前提下，合理安排仓库向各门店的补货数量，使公司当月的总运营成本最低。
        </p>
        <p className="text-white/80 text-sm leading-relaxed mt-2">
          在接下来的游戏中，你将通过{' '}
          <span className="bg-blue-500/60 text-white font-bold px-1.5 py-0.5 rounded text-xs">3</span>{' '}
          轮决策与反馈，逐步体验在复杂业务环境下进行库存与配送优化的挑战，并理解运筹优化方法在真实商业决策中的价值。
        </p>
      </div>

      {/* 轮次标签 */}
      <div className="flex gap-3 flex-wrap">
        <span
          className={`px-4 py-1.5 rounded-full text-sm font-medium border ${
            stage === 1
              ? 'bg-white text-blue-700 border-white'
              : 'bg-white/20 text-white/80 border-white/30'
          }`}
        >
          第一轮：基础库存决策
        </span>
        <span
          className={`px-4 py-1.5 rounded-full text-sm font-medium border ${
            stage === 2
              ? 'bg-white text-blue-700 border-white'
              : 'bg-white/20 text-white/80 border-white/30'
          }`}
        >
          第二轮：多约束优化决策
        </span>
        <span className="px-4 py-1.5 rounded-full text-sm font-medium border bg-white/10 text-white/50 border-white/20 cursor-not-allowed">
          第三轮：优化求解器（即将开放）
        </span>
      </div>
    </div>
  );
}

// ─── 子组件：步骤标签页 ──────────────────────────────────────
function StepTabs({ stage }: { stage: 1 | 2 }) {
  return (
    <div className="grid grid-cols-3 border-b border-gray-200 bg-white">
      {/* 步骤1 */}
      <div
        className={`flex flex-col items-center py-5 border-b-2 transition-colors ${
          stage === 1
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-transparent text-gray-400'
        }`}
      >
        <span className="text-3xl font-bold leading-none">1</span>
        <span className="text-sm font-medium mt-1">基础库存决策</span>
      </div>
      {/* 步骤2 */}
      <div
        className={`flex flex-col items-center py-5 border-b-2 transition-colors border-r border-l border-gray-100 ${
          stage === 2
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-transparent text-gray-400'
        }`}
      >
        <span className="text-3xl font-bold leading-none">2</span>
        <span className="text-sm font-medium mt-1">多约束优化决策</span>
      </div>
      {/* 步骤3 */}
      <div className="flex flex-col items-center py-5 border-b-2 border-transparent text-gray-300">
        <span className="text-3xl font-bold leading-none">3</span>
        <span className="text-sm font-medium mt-1">优化求解器</span>
      </div>
    </div>
  );
}

// ─── 子组件：统计卡片行 ──────────────────────────────────────
function StatsRow() {
  const totalInventory = useMemo(() => {
    return DATA.warehouses.reduce((sum, wh) => {
      return sum + Object.values(DATA.warehouse_inventory[wh] ?? {}).reduce((s, v) => s + v, 0);
    }, 0);
  }, []);

  const stats = [
    { label: '仓库数量', value: DATA.warehouses.length, unit: '个', color: 'text-blue-600' },
    { label: '门店数量', value: DATA.stores.length, unit: '家', color: 'text-blue-600' },
    { label: 'SKU种类', value: DATA.skus.length, unit: '种', color: 'text-blue-600' },
    {
      label: '仓库总库存',
      value: totalInventory.toLocaleString(),
      unit: '件',
      color: 'text-blue-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-6 py-4 bg-gray-50">
      {stats.map(stat => (
        <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="text-xs text-gray-500 mb-2">{stat.label}</div>
          <div className="flex items-baseline gap-1">
            <span className={`text-3xl font-bold ${stat.color}`}>{stat.value}</span>
            <span className="text-sm text-gray-500">{stat.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 子组件：两个 Recharts 柱状图 ────────────────────────
function ChartsRow() {
  const warehouseData = useWarehouseChartData();
  const storeData = useStoreChartData();
  // 图表使用全部6个系列
  const seriesList = ALL_SERIES_FOR_CHART;

  const warehouseDataShort = warehouseData;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-b border-gray-200">
      {/* 左图：仓库库存水平 */}
      <div className="bg-white p-6 border-r border-gray-200">
        <h3 className="text-base font-semibold text-gray-900 mb-1">仓库可用库存水平</h3>
        <p className="text-xs text-gray-500 mb-4">3个仓库各系列库存分布（件）</p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={warehouseDataShort} margin={{ top: 5, right: 10, left: 10, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              angle={-15}
              textAnchor="end"
              height={60}
            />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} label={{ value: '库存量（件）', angle: -90, position: 'insideLeft', offset: -5, style: { fontSize: 11, fill: '#9ca3af' } }} />
            <Tooltip
              formatter={(value: number, name: string) => [value.toLocaleString() + ' 件', name]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value: string) => value.replace('系列(直营店特供)', '(直营特供)').replace('系列', '')}
            />
            {seriesList.map(series => (
              <Bar key={series} dataKey={series} stackId="a" fill={SERIES_COLORS[series]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 右图：门店需求规模 */}
      <div className="bg-white p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">门店需求规模</h3>
        <p className="text-xs text-gray-500 mb-4">10家门店月需求量 vs 当前库存（件）</p>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={storeData} margin={{ top: 5, right: 10, left: 10, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: '#6b7280' }}
              angle={-30}
              textAnchor="end"
              height={70}
              interval={0}
            />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} label={{ value: '数量（件）', angle: -90, position: 'insideLeft', offset: -5, style: { fontSize: 11, fill: '#9ca3af' } }} />
            <Tooltip
              formatter={(value: number, name: string) => [value.toLocaleString() + ' 件', name]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="月需求量" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
            <Line
              type="monotone"
              dataKey="当前库存"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ fill: '#f59e0b', r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── 子组件：图例说明与游戏说明之间的过渡文字 ────────────────────
function GameScopeNote() {
  return (
    <div className="bg-blue-50 border-b border-blue-100 px-6 py-3">
      <p className="text-sm text-blue-800">
        接下来，我们从3个区域仓库、10个门店和6个饼干系列中选取2个门店，2款产品和2个仓库，进行游戏模拟。
      </p>
    </div>
  );
}

// ─── 子组件：约束说明区 ──────────────────────────────
function ConstraintInfo({ stage }: { stage: 1 | 2 }) {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            {stage === 1 ? '第一轮：基础库存决策' : '第二轮：多约束优化决策'}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {stage === 1
              ? '仓库库存约束 · 最小化运输成本 + 缺货成本'
              : '全约束激活 · 最小化总成本（运输+缺货+持货+惩罚）'}
          </p>
        </div>
        <a
          href="#decision"
          className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          仓库库存约束 →
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 本轮约束条件 */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">本轮约束条件</h4>
          <div className="space-y-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-800">
                <span className="font-semibold">C1 仓库库存约束：</span>
                各仓库每个SKU的发货总量不能超过其当前可用库存。
              </p>
            </div>
            {stage === 2 && (
              <>
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm text-red-800">
                    <span className="font-semibold">C2 安全库存约束（HARD）：</span>
                    仓库月末库存不得低于安全库存下限。
                  </p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                  <p className="text-sm text-blue-800">
                    <span className="font-semibold">C3 直营店容量（HARD）：</span>
                    月末库存 ≤ 仓储容量上限。
                  </p>
                </div>
                <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3">
                  <p className="text-sm text-purple-800">
                    <span className="font-semibold">C4 直营店预算（SOFT）：</span>
                    运输成本 ≤ 月度预算（违反产生惩罚成本）。
                  </p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                  <p className="text-sm text-green-800">
                    <span className="font-semibold">C5 商超进货上限（HARD）：</span>
                    月进货量 ≤ 商超合同上限。
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 目标函数 */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">目标函数</h4>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
            <p className="text-sm font-semibold text-gray-800 mb-3">
              最小化总成本 = 运输成本 + 缺货成本{stage === 2 ? ' + 持货成本 + 软约束惩罚' : ''}
            </p>
            <ul className="space-y-1.5 text-sm text-gray-600">
              <li>• 运输成本 = Σ 配送量 × 单位运输成本</li>
              <li>• 缺货成本 = Σ max(0, 需求 − 库存 − 补货) × 缺货惩罚</li>
              {stage === 2 && (
                <>
                  <li>• 持货成本 = Σ 月末库存 × 单位持货成本</li>
                  <li>• 软约束惩罚 = C2违反惩罚 + C4违反惩罚</li>
                </>
              )}
            </ul>
          </div>


        </div>
      </div>
    </div>
  );
}

// ─── 子组件：第二轮约束详情面板 ──────────────────────────────
function Stage2ConstraintsPanel() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-sm">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-amber-500">⚡</span>
          <h2 className="text-sm font-semibold text-amber-700">第二轮新增约束详情</h2>
        </div>
        <span className="text-gray-400 text-xs">{expanded ? '▲ 收起' : '▼ 展开'}</span>
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
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="text-xs font-semibold text-gray-700 mb-2">直营店约束</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="text-left pb-1">门店</th>
                        <th className="text-right pb-1">仓储容量</th>
                        <th className="text-right pb-1">月度预算</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DATA.direct_stores.map(store => {
                        const c = DATA.direct_store_constraints[store];
                        return (
                          <tr key={store} className="border-t border-gray-100">
                            <td className="py-1 text-gray-500 truncate max-w-[100px]">{store}</td>
                            <td className="py-1 text-right font-mono text-gray-700">
                              {c?.storage_capacity ?? '∞'}
                            </td>
                            <td className="py-1 text-right font-mono text-gray-700">
                              ¥{c?.monthly_budget?.toLocaleString() ?? '∞'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="mt-2 text-[10px] text-gray-400">
                    C3(HARD)：月末库存≤仓储容量 | C4(SOFT)：运输成本≤月度预算
                  </div>
                </div>
                {/* 商超约束 */}
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="text-xs font-semibold text-gray-700 mb-2">
                    商超进货上限 (C5 HARD)
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="text-left pb-1">门店</th>
                        <th className="text-right pb-1">月进货上限</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DATA.supermarkets.map(store => {
                        const c = DATA.supermarket_constraints[store];
                        return (
                          <tr key={store} className="border-t border-gray-100">
                            <td className="py-1 text-gray-500 truncate max-w-[120px]">{store}</td>
                            <td className="py-1 text-right font-mono text-gray-700">
                              {c?.monthly_order_limit ?? '∞'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── 子组件：仓库库存侧边卡片 ──────────────────────────────────
function WarehousePanel({ stage }: { stage: 1 | 2 }) {
  const whInv = useMemo(() => aggregateWarehouseInventory(DATA), []);
  const whSafety = useMemo(() => aggregateSafetyStock(DATA), []);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-blue-600 text-base">🏭</span>
        <h2 className="text-sm font-semibold text-gray-800">仓库可用库存</h2>
        {stage === 2 && (
          <span className="ml-auto text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            需保留安全库存
          </span>
        )}
      </div>
      <div className="space-y-3">
        {VISIBLE_WAREHOUSES.map(wh => {
          const totalInv = VISIBLE_SERIES.reduce((s, sr) => s + (whInv[wh]?.[sr] ?? 0), 0);
          const totalSafety = VISIBLE_SERIES.reduce((s, sr) => s + (whSafety[wh]?.[sr] ?? 0), 0);
          const usable = stage === 2 ? Math.max(0, totalInv - totalSafety) : totalInv;
          const pct = totalInv > 0 ? (usable / totalInv) * 100 : 0;
          return (
            <div key={wh} className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 truncate max-w-[120px]">{wh}</span>
                <span className="font-mono text-xs text-gray-700">
                  <span className="text-blue-600 font-semibold">{usable.toLocaleString()}</span>
                  <span className="text-gray-400">/{totalInv.toLocaleString()}</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: pct > 60 ? '#22c55e' : pct > 30 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
              {stage === 2 && (
                <div className="text-xs text-amber-600/80">
                  安全库存下限：{totalSafety.toLocaleString()} 件
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 子组件：门店需求侧边卡片（展示2个具体门店）
function DemandPanel() {
  const seriesList = VISIBLE_SERIES;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-blue-600 text-base">🏪</span>
        <h2 className="text-sm font-semibold text-gray-800">门店需求概览</h2>
      </div>
      <div className="space-y-4">
        {VISIBLE_STORES.map(store => {
          const isDirect = DATA.direct_stores.includes(store);
          const totalDemand = seriesList.reduce((s, sr) => {
            const skusInSeries = DATA.skus.filter(sku => DATA.sku_series[sku] === sr);
            return s + skusInSeries.reduce((s2, sku) => s2 + (DATA.demand[store]?.[sku] ?? 0), 0);
          }, 0);
          const totalInv = seriesList.reduce((s, sr) => {
            const skusInSeries = DATA.skus.filter(sku => DATA.sku_series[sku] === sr);
            return s + skusInSeries.reduce((s2, sku) => s2 + (DATA.current_store_inventory[store]?.[sku] ?? 0), 0);
          }, 0);
          const netNeed = Math.max(0, totalDemand - totalInv);
          const storeColor = isDirect ? '#6366f1' : '#0ea5e9';
          return (
            <div key={store}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: storeColor }} />
                  <span className="text-xs font-medium text-gray-700 truncate max-w-[110px]">{store}</span>
                  <span className="text-xs text-gray-400">({isDirect ? '直营' : '商超'})</span>
                </div>
                <span className="font-mono text-xs text-gray-700">
                  净需求{' '}
                  <span className="text-blue-600 font-semibold">{netNeed.toLocaleString()}</span> 件
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {seriesList.map(sr => {
                  const skusInSeries = DATA.skus.filter(sku => DATA.sku_series[sku] === sr);
                  const d = skusInSeries.reduce((s, sku) => s + (DATA.demand[store]?.[sku] ?? 0), 0);
                  const inv = skusInSeries.reduce((s, sku) => s + (DATA.current_store_inventory[store]?.[sku] ?? 0), 0);
                  const net = Math.max(0, d - inv);
                  return (
                    <div
                      key={sr}
                      className="rounded px-1.5 py-1 text-center"
                      style={{
                        background: `${SERIES_COLORS[sr]}15`,
                        border: `1px solid ${SERIES_COLORS[sr]}30`,
                      }}
                    >
                      <div className="text-xs" style={{ color: SERIES_COLORS[sr] }}>
                        {SERIES_ICONS[sr]}
                      </div>
                      <div className="font-mono text-xs font-semibold" style={{ color: SERIES_COLORS[sr] }}>
                        {net}
                      </div>
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
  const seriesList = VISIBLE_SERIES;
  const whInv = useMemo(() => aggregateWarehouseInventory(DATA), []);
  const whSafety = useMemo(() => aggregateSafetyStock(DATA), []);
  const groups = VISIBLE_STORES;
  // 计算各仓库已分配量（系列维度）
  const allocated = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const wh of VISIBLE_WAREHOUSES) {
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
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-x-auto">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-blue-600 text-base">📋</span>
        <h2 className="text-sm font-semibold text-gray-800">配送决策</h2>
        <span className="text-xs text-gray-400 ml-1">（单位：件）</span>
        {stage === 2 && (
          <span className="ml-auto text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            第二轮新增约束已激活
          </span>
        )}
      </div>

      <div className="min-w-[500px]">
        {/* 表头 */}
          <div className="grid grid-cols-[140px_1fr] gap-2 mb-2">
          <div />
          <div className="grid grid-cols-2 gap-1">
            {seriesList.map(series => (
              <div
                key={series}
                className="text-center text-xs font-medium py-1 px-1 rounded"
                style={{
                  color: SERIES_COLORS[series],
                  background: `${SERIES_COLORS[series]}15`,
                }}
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
        {VISIBLE_WAREHOUSES.map(wh => (
          <div key={wh} className="mb-4">
            {/* 仓库标题行 */}
            <div className="flex items-center gap-2 mb-2 py-1 border-b border-gray-100">
              <span className="text-xs font-semibold text-blue-600 w-[140px] truncate">{wh}</span>
              <div className="grid grid-cols-2 gap-1 flex-1">
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
                        className={`font-mono text-[10px] ${isOver ? 'text-red-500 font-bold' : 'text-gray-400'}`}
                      >
                        余{Math.round(remaining)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 门店行 */}
            {groups.map(group => {
              const isDirectStore = DATA.direct_stores.includes(group);
              const storeColor = isDirectStore ? '#6366f1' : '#0ea5e9';
              return (
              <div key={group} className="grid grid-cols-[140px_1fr] gap-2 mb-2 items-center">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: storeColor }}
                  />
                  <span className="text-xs text-gray-500 truncate max-w-[120px]">{group}</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {seriesList.map(series => {
                    const isDisabled = false;
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
                        onChange={e =>
                          onChange(wh, group, series, Math.max(0, parseInt(e.target.value) || 0))
                        }
                        className={`game-input text-center ${
                          isDisabled
                            ? 'opacity-20 cursor-not-allowed'
                            : isOver
                            ? 'border-red-400 text-red-500 bg-red-50'
                            : ''
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>
        ))}
      </div>
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
  const [activeTab, setActiveTab] = useState<
    'overview' | 'series' | 'stores' | 'constraints' | 'details'
  >('overview');
  const cs = result.cost_summary;

  const costItems = [
    { label: '运输成本 C_trans', value: cs.c_trans, color: '#2563eb', desc: '仓库→门店运输费用' },
    { label: '缺货成本 C_short', value: cs.c_short, color: '#ef4444', desc: '未满足需求的惩罚' },
    { label: '持货成本 C_hold', value: cs.c_hold, color: '#7c3aed', desc: '门店+仓库库存持有' },
    {
      label: '软约束惩罚 C_pen',
      value: cs.c_pen,
      color: '#d97706',
      desc: stage === 1 ? 'C2安全库存违反惩罚' : 'C2+C4约束违反惩罚',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm"
    >
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <h2 className="text-sm font-semibold text-gray-800">计算结果</h2>
        </div>
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
            result.valid
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {result.valid ? '✓ 所有硬约束满足' : `✗ ${result.errors.length} 项约束违反`}
        </div>
      </div>

      {/* 总成本 */}
      <div className="text-center py-4 mb-4 rounded-xl bg-blue-50 border border-blue-100">
        <div className="text-xs text-gray-500 mb-1">总成本 C_total</div>
        <div className="font-mono text-3xl font-bold text-blue-600 animate-count">
          ¥
          {cs.c_total.toLocaleString('zh-CN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
      </div>

      {/* 成本分解 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {costItems.map(item => (
          <div key={item.label} className="rounded-lg p-3 border border-gray-100 bg-gray-50">
            <div className="text-[10px] text-gray-400 mb-1">{item.label}</div>
            <div className="font-mono text-sm font-bold" style={{ color: item.color }}>
              ¥
              {item.value.toLocaleString('zh-CN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">{item.desc}</div>
          </div>
        ))}
      </div>

      {/* 标签页 */}
      <div className="flex gap-1 mb-3 border-b border-gray-200">
        {(['overview', 'series', 'stores', 'constraints', 'details'] as const).map(tab => {
          const labels = {
            overview: '门店组满足率',
            series: '系列分析',
            stores: '仓库状态',
            constraints: '约束状态',
            details: '缺货明细',
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-400 border-transparent hover:text-gray-700'
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
            {VISIBLE_STORES.map(store => {
              const sf = result.store_fulfillment[store];
              const rate = sf?.fulfillment_rate ?? 0;
              const isDirect = DATA.direct_stores.includes(store);
              const storeColor = isDirect ? '#6366f1' : '#0ea5e9';
              return (
                <div key={store} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: storeColor }} />
                    <span className="text-xs font-medium text-gray-700 truncate max-w-[120px]">{store}</span>
                    <span className="text-[10px] text-gray-400">({isDirect ? '直营' : '商超'})</span>
                  </div>
                  <div
                    className="font-mono text-2xl font-bold mb-1"
                    style={{ color: rate >= 95 ? '#16a34a' : rate >= 80 ? '#d97706' : '#dc2626' }}
                  >
                    {rate}%
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-1">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${rate}%`,
                        background: rate >= 95 ? '#22c55e' : rate >= 80 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-gray-400">
                    满足 {sf?.total_fulfilled?.toLocaleString()} / {sf?.total_demand?.toLocaleString()} 件
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'series' && (
          <div className="space-y-2">
            {result.series_summary.filter(s => VISIBLE_SERIES.includes(s.series)).map(s => {
              const rate =
                s.total_demand > 0
                  ? Math.round(((s.total_demand - s.total_shortage) / s.total_demand) * 1000) / 10
                  : 100;
              return (
                <div
                  key={s.series}
                  className="flex items-center gap-3 rounded-lg p-2 border border-gray-100"
                >
                  <span className="text-lg w-7 text-center">{SERIES_ICONS[s.series]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-xs font-medium"
                        style={{ color: SERIES_COLORS[s.series] }}
                      >
                        {s.series.replace('系列(直营店特供)', '★').replace('系列', '')}
                      </span>
                      <span className="font-mono text-xs text-gray-700">{rate}% 满足</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${rate}%`, background: SERIES_COLORS[s.series] }}
                      />
                    </div>
                    <div className="flex gap-3 mt-1 text-[10px] text-gray-400">
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
            {VISIBLE_WAREHOUSES.map(wh => {
              const usage = result.inventory_usage[wh];
              const c2 = result.constraint_status['C2'];
              const c2ViolWh = c2?.details?.filter(d => d.warehouse === wh) ?? [];
              return (
                <div key={wh} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-700">{wh}</span>
                    <span
                      className={`font-mono text-xs ${c2ViolWh.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}
                    >
                      {c2ViolWh.length > 0
                        ? `⚠ ${c2ViolWh.length} SKU低于安全库存`
                        : '✓ 安全库存满足'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-gray-400">月初库存</div>
                      <div className="font-mono font-semibold text-gray-700">
                        {usage?.total_available?.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400">已发货</div>
                      <div className="font-mono font-semibold text-blue-600">
                        {usage?.total_sent?.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400">月末剩余</div>
                      <div className="font-mono font-semibold text-gray-700">
                        {usage?.total_remaining?.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${usage?.utilization_rate ?? 0}%`, background: '#2563eb' }}
                    />
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    库存利用率 {usage?.utilization_rate}% | 安全库存下限{' '}
                    {usage?.total_safety_stock?.toLocaleString()} 件
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'constraints' && (
          <div className="space-y-2">
            {Object.entries(result.constraint_status)
              .filter(([key]) => stage === 1 ? ['C1', 'C2'].includes(key) : true)
              .map(([key, status]) => (
              <div
                key={key}
                className={`rounded-lg border p-3 ${
                  status.satisfied
                    ? 'constraint-ok'
                    : 'constraint-err'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold">{key}</span>
                    <span className="text-xs">{status.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] opacity-70">{status.mode}</span>
                    <span className="text-xs font-semibold">
                      {status.satisfied ? '✓ 满足' : '✗ 违反'}
                    </span>
                  </div>
                </div>
                {status.penalty !== undefined && status.penalty > 0 && (
                  <div className="text-[10px] mt-1 text-amber-600">
                    惩罚成本：¥{status.penalty.toFixed(2)}
                  </div>
                )}
                {!status.satisfied && status.details.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {status.details.slice(0, 3).map((d, i) => (
                      <div key={i} className="text-[10px] bg-red-50 rounded px-2 py-1 text-red-700">
                        {d.warehouse && `${d.warehouse} `}
                        {d.store && `${d.store} `}
                        {d.sku && `${d.sku} `}
                        {d.excess !== undefined && `超出 ${d.excess} 件`}
                        {d.violation !== undefined && `违反 ${d.violation} 件`}
                        {d.ordered !== undefined &&
                          d.limit !== undefined &&
                          `进货 ${d.ordered} > 上限 ${d.limit}`}
                      </div>
                    ))}
                    {status.details.length > 3 && (
                      <div className="text-[10px] text-gray-400">
                        ...还有 {status.details.length - 3} 条
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'details' && (
          <div>
            {result.stockout_details.filter(d => VISIBLE_STORES.includes(d.store) && VISIBLE_SERIES.includes(d.series)).length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">🎉 无缺货记录</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-200">
                      <th className="text-left py-1.5 pr-2">门店</th>
                      <th className="text-left py-1.5 pr-2">系列</th>
                      <th className="text-right py-1.5 pr-2">净需求</th>
                      <th className="text-right py-1.5 pr-2">缺货</th>
                      <th className="text-right py-1.5">缺货成本</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.stockout_details
                      .filter(d => VISIBLE_STORES.includes(d.store) && VISIBLE_SERIES.includes(d.series))
                      .map((d, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-1 pr-2 text-gray-500 truncate max-w-[80px]">{d.store}</td>
                          <td className="py-1 pr-2" style={{ color: SERIES_COLORS[d.series] }}>
                            {SERIES_ICONS[d.series]}
                            {d.series.replace('系列(直营店特供)', '').replace('系列', '')}
                          </td>
                          <td className="py-1 pr-2 text-right font-mono text-gray-700">{d.demand}</td>
                          <td className="py-1 pr-2 text-right font-mono text-red-500">{d.shortfall}</td>
                          <td className="py-1 text-right font-mono text-red-500">¥{d.stockout_cost.toFixed(2)}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
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
          className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-emerald-700">✓ 第一轮决策完成！</div>
              <div className="text-xs text-gray-500 mt-0.5">
                点击进入第二轮，体验更多约束下的优化挑战
              </div>
            </div>
            <button
              onClick={onNextStage}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
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

  // 初始化空决策
  const emptyDecisions = useCallback((): SeriesGroupDecisions => {
    const d: SeriesGroupDecisions = {};
    for (const wh of VISIBLE_WAREHOUSES) {
      d[wh] = {};
      for (const store of VISIBLE_STORES) {
        d[wh][store] = {};
        for (const series of VISIBLE_SERIES) {
          d[wh][store][series] = 0;
        }
      }
    }
    return d;
  }, []);
  const emptyModes = useCallback((): TransportModeDecisions => {
    const m: TransportModeDecisions = {};
    for (const wh of VISIBLE_WAREHOUSES) {
      m[wh] = {};
      for (const store of VISIBLE_STORES) {
        m[wh][store] = 'box';
      }
    }
    return m;
  }, []);

  const handleChange = useCallback(
    (wh: string, group: string, series: string, val: number) => {
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
    },
    []
  );

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
          toast.success(
            `计算完成，总成本 ¥${res.cost_summary.c_total.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
            {
              description: res.warnings.length > 0 ? `${res.warnings.length} 条软约束警告` : '所有约束满足',
            }
          );
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
    toast.info('进入第二轮', {
      description: '新增直营店容量/预算约束、商超进货上限',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const roundLabel = stage === 1 ? '第一轮：基础库存决策' : '第二轮：多约束优化';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <TopNav stage={stage} round={roundLabel} />

      {/* Hero 横幅 */}
      <HeroBanner stage={stage} />

      {/* 步骤标签页 */}
      <StepTabs stage={stage} />

      {/* 统计卡片 */}
      <StatsRow />

      {/* 两个柱状图 */}
      <ChartsRow />

      {/* 图例说明与第一轮游戏说明之间的过渡文字 */}
      <GameScopeNote />

      {/* 约束说明区 */}
      <ConstraintInfo stage={stage} />

      {/* 决策区 */}
      <div id="decision" className="container py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* 左侧信息面板 */}
          <div className="space-y-4">
            <WarehousePanel stage={stage} />
            <DemandPanel />

          </div>

          {/* 右侧决策区 */}
          <div className="space-y-4">
            {/* 第二轮参数展示区（在决策输入上方） */}
            {stage === 2 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="text-xs font-semibold text-amber-800 mb-3">[第二轮约束参数]</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-amber-200">
                      <th className="text-left py-1 pr-3">参数</th>
                      <th className="text-left py-1 pr-3">门店</th>
                      <th className="text-right py-1">数值</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-700">
                    <tr className="border-b border-amber-100">
                      <td className="py-1 pr-3 font-medium" rowSpan={2}>运输成本（元/件）</td>
                      <td className="py-1 pr-3">南京东路直营店</td>
                      <td className="py-1 text-right font-mono">奉贤4.2 / 嘉定4.68</td>
                    </tr>
                    <tr className="border-b border-amber-100">
                      <td className="py-1 pr-3">大象超市(长宁店)</td>
                      <td className="py-1 text-right font-mono">奉贤5.1 / 嘉定3.48</td>
                    </tr>
                    <tr className="border-b border-amber-100">
                      <td className="py-1 pr-3 font-medium">月度预算（元）</td>
                      <td className="py-1 pr-3">南京东路直营店</td>
                      <td className="py-1 text-right font-mono">15,000</td>
                    </tr>
                    <tr className="border-b border-amber-100">
                      <td className="py-1 pr-3 font-medium">商超合同上限（件）</td>
                      <td className="py-1 pr-3">大象超市(长宁店)</td>
                      <td className="py-1 text-right font-mono">1,800</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-3 font-medium">仓储容量上限（件）</td>
                      <td className="py-1 pr-3">南京东路直营店</td>
                      <td className="py-1 text-right font-mono">800</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {/* 操作按钮栏 */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-gray-800 mr-2">运输决策输入</h3>
              <div className="flex-1" />
              <button
                onClick={handleClear}
                className="px-4 py-2 bg-white text-gray-600 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                全部清零
              </button>

              <button
                onClick={handleCalculate}
                disabled={isCalculating}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
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
