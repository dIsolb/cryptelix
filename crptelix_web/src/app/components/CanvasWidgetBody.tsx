import { memo } from 'react';
import { Widget } from './DashboardWidget';
import { KeyMetricsCards } from './TradingMetrics';
import { FtrLiveMetricCard, FtrReportTable } from './FtrReportTable';
import { PortfolioWidget } from './PortfolioWidget';
import { PortfolioMixWidget } from './PortfolioMixWidget';
import { WvlWidget } from './WvlWidget';
import { ProfitTrendWidget } from './ProfitTrendWidget';
import { PriceChartWidget } from './PriceChartWidget';
import { PnlCalendarWidget } from './PnlCalendarWidget';
import { SymbolScorecardWidget } from './SymbolScorecardWidget';
import { SessionHeatmapWidget } from './SessionHeatmapWidget';

interface CanvasWidgetBodyProps {
  widget: Widget;
  onExtractMetric: (
    label: string,
    value: string | number,
    isPositive?: boolean,
    isNegative?: boolean
  ) => void;
}

export const CanvasWidgetBody = memo(function CanvasWidgetBody({
  widget,
  onExtractMetric,
}: CanvasWidgetBodyProps) {
  switch (widget.type) {
    case 'line-chart':
      return <PriceChartWidget />;

    case 'bar-chart':
      return <WvlWidget />;

    case 'area-chart':
      return <ProfitTrendWidget />;

    case 'pie-chart':
      return <PortfolioMixWidget />;

    case 'stats-card':
      if (widget.data?.ftrMetricKey) {
        const label = String(widget.data.ftrMetricKey).replace(/^ftr:/, '');
        return (
          <FtrLiveMetricCard
            label={label}
            fallbackValue={widget.data.value}
            fallbackPositive={widget.data.isPositive}
            fallbackNegative={widget.data.isNegative}
          />
        );
      }
      return <KeyMetricsCards />;

    case 'table':
      return <FtrReportTable onExtractMetric={onExtractMetric} />;

    case 'portfolio-widget':
    case 'portfolio':
      return <PortfolioWidget />;

    case 'pnl-calendar':
      return <PnlCalendarWidget />;

    case 'symbol-scorecard':
      return <SymbolScorecardWidget />;

    case 'session-heatmap':
      return <SessionHeatmapWidget />;

    default:
      return (
        <div className="flex h-full items-center justify-center text-sm text-gray-500">
          Widget content
        </div>
      );
  }
});
