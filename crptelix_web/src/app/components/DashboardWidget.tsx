import { useDrag } from 'react-dnd';
import { GripVertical, X, TrendingUp, TrendingDown } from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card } from './ui/card';
import { KeyMetricsCards } from './TradingMetrics';

export type WidgetType =
  | 'line-chart'
  | 'bar-chart'
  | 'pie-chart'
  | 'area-chart'
  | 'stats-card'
  | 'table'
  | 'text-field'
  | 'portfolio'
  | 'portfolio-widget'
  | 'pnl-calendar'
  | 'symbol-scorecard'
  | 'session-heatmap';

export function widgetDefaultSize(type: WidgetType): { width: number; height: number } {
  switch (type) {
    case 'table':
      return { width: 600, height: 500 };
    case 'portfolio':
    case 'portfolio-widget':
      return { width: 800, height: 600 };
    case 'pnl-calendar':
      return { width: 440, height: 360 };
    case 'symbol-scorecard':
      return { width: 480, height: 380 };
    case 'session-heatmap':
      return { width: 460, height: 440 };
    default:
      return { width: 400, height: 320 };
  }
}

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  data?: any;
}

interface DashboardWidgetProps {
  widget: Widget;
  onRemove: (id: string) => void;
  onUpdatePosition?: (id: string, position: { x: number; y: number }) => void;
  onUpdateSize?: (id: string, size: { width: number; height: number }) => void;
  isInCanvas?: boolean;
}

// Sample data
const chartData = [
  { name: 'Jan', value: 42000, revenue: 24000, change: 5.2 },
  { name: 'Feb', value: 38000, revenue: 19800, change: -9.5 },
  { name: 'Mar', value: 52000, revenue: 39800, change: 36.8 },
  { name: 'Apr', value: 47800, revenue: 43908, change: -8.1 },
  { name: 'May', value: 51890, revenue: 48000, change: 8.5 },
  { name: 'Jun', value: 62390, revenue: 58000, change: 20.2 },
];

const pieData = [
  { name: 'BTC', value: 400, color: '#52525b' },
  { name: 'ETH', value: 300, color: '#71717a' },
  { name: 'DeFi', value: 200, color: '#a1a1aa' },
  { name: 'NFT', value: 100, color: '#d4d4d8' },
];

const tableData = [
  { product: 'Bitcoin (BTC)', sales: 1234, revenue: '$45,678', growth: '+12.4%' },
  { product: 'Ethereum (ETH)', sales: 987, revenue: '$32,456', growth: '+8.2%' },
  { product: 'Uniswap (UNI)', sales: 756, revenue: '$28,901', growth: '-3.5%' },
  { product: 'Aave (AAVE)', sales: 543, revenue: '$19,234', growth: '+15.7%' },
  { product: 'Chainlink (LINK)', sales: 432, revenue: '$16,890', growth: '-2.1%' },
];

export function DashboardWidget({ widget, onRemove, isInCanvas }: DashboardWidgetProps) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'widget',
    item: { widget },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const renderWidgetContent = () => {
    switch (widget.type) {
      case 'line-chart':
        return (
          <div style={{ width: '100%', height: '100%', minHeight: '200px', minWidth: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="name" fontSize={12} stroke="#71717a" />
                <YAxis fontSize={12} stroke="#71717a" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#18181b', 
                    border: '1px solid #3f3f46',
                    borderRadius: '6px',
                    color: '#fff'
                  }} 
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ fill: '#22c55e', r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );

      case 'bar-chart':
        return (
          <div style={{ width: '100%', height: '100%', minHeight: '200px', minWidth: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="name" fontSize={12} stroke="#71717a" />
                <YAxis fontSize={12} stroke="#71717a" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#18181b', 
                    border: '1px solid #3f3f46',
                    borderRadius: '6px',
                    color: '#fff'
                  }} 
                />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`bar-cell-${index}`} fill={entry.change > 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case 'area-chart':
        return (
          <div style={{ width: '100%', height: '100%', minHeight: '200px', minWidth: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="name" fontSize={12} stroke="#71717a" />
                <YAxis fontSize={12} stroke="#71717a" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#18181b', 
                    border: '1px solid #3f3f46',
                    borderRadius: '6px',
                    color: '#fff'
                  }} 
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#22c55e"
                  fill="#22c55e"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );

      case 'pie-chart':
        return (
          <div style={{ width: '100%', height: '100%', minHeight: '200px', minWidth: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`pie-cell-${index}-${entry.name}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#18181b', 
                    border: '1px solid #facc15',
                    borderRadius: '8px',
                    color: '#fff'
                  }} 
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );

      case 'stats-card':
        return (
          <div className="h-full min-h-0 w-full overflow-hidden">
            <KeyMetricsCards />
          </div>
        );

      case 'table':
        return (
          <div className="h-full overflow-auto">
            <table className="w-full">
              <thead className="bg-zinc-900 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">
                    Token
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">
                    Volume
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">
                    Market Cap
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">
                    24h Change
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, idx) => (
                  <tr key={idx} className="border-t border-zinc-800">
                    <td className="px-4 py-3 text-sm text-white">{row.product}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{row.sales}</td>
                    <td className="px-4 py-3 text-sm font-medium text-white">{row.revenue}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-sm flex items-center gap-1 ${
                          row.growth.startsWith('+')
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}
                      >
                        {row.growth.startsWith('+') ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {row.growth}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  };

  return (
    <div
      ref={isInCanvas ? drag : null}
      className={`relative h-full transition-all ${
        isDragging ? 'opacity-50 rotate-1 scale-105' : ''
      } ${isInCanvas ? 'cursor-move' : ''}`}
    >
      <Card className="h-full bg-zinc-900/95 border border-zinc-800 hover:border-zinc-700">
        {isInCanvas && (
          <>
            <div className="absolute top-3 left-3 cursor-move opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <GripVertical className="w-4 h-4 text-gray-500" />
            </div>
            <button
              onClick={() => onRemove(widget.id)}
              className="absolute top-3 right-3 p-1 rounded hover:bg-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </>
        )}
        <div className="p-4 h-full flex flex-col group">
          <h3 className="font-semibold mb-3 text-white text-sm">{widget.title}</h3>
          <div className="flex-1" style={{ minHeight: 0, height: '100%' }}>{renderWidgetContent()}</div>
        </div>
      </Card>
    </div>
  );
}