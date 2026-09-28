import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactElement } from "react";

import type { ActivityMetric } from "../../types/schema";

export interface ActivityBurndownChartProps {
  metrics: ActivityMetric[];
}

interface ChartRow {
  name: string;
  target_hours: number;
  completed_hours: number;
  color: string;
  is_cap_reached: boolean;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
}): ReactElement | null {
  if (!active || !payload?.length) {
    return null;
  }

  const row = payload[0]?.payload;
  if (!row) {
    return null;
  }

  const pct =
    row.target_hours > 0
      ? Math.min(100, (row.completed_hours / row.target_hours) * 100)
      : 0;

  return (
    <div className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 shadow-lg">
      <p className="font-semibold">{row.name}</p>
      <p>Target: {row.target_hours.toFixed(1)}h</p>
      <p>Completed: {row.completed_hours.toFixed(1)}h</p>
      <p>Progress: {pct.toFixed(1)}%</p>
      {row.is_cap_reached ? (
        <p className="mt-1 text-amber-300">Cap reached</p>
      ) : null}
    </div>
  );
}

export function ActivityBurndownChart({
  metrics,
}: ActivityBurndownChartProps): ReactElement {
  const chartData: ChartRow[] = metrics.map((metric) => ({
    name: metric.name,
    target_hours: metric.target_hours,
    completed_hours: metric.completed_hours,
    color: metric.color,
    is_cap_reached: metric.is_cap_reached,
  }));

  const maxTarget = Math.max(1, ...chartData.map((row) => row.target_hours));

  if (chartData.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50 text-sm text-slate-400">
        No activity metrics for this week yet.
      </div>
    );
  }

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Activity Burndown
      </h3>
      <div className="h-[min(420px,60vh)] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
            barCategoryGap={12}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              type="number"
              domain={[0, Math.ceil(maxTarget + 2)]}
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              stroke="#94a3b8"
              tick={{ fill: "#cbd5e1", fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "#1e293b" }} />
            <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
            <ReferenceLine
              x={maxTarget}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              label={{
                value: "Max cap reference",
                position: "insideTopRight",
                fill: "#fbbf24",
                fontSize: 11,
              }}
            />
            <Bar
              dataKey="target_hours"
              name="Target Hours"
              fill="#475569"
              radius={[0, 4, 4, 0]}
              barSize={12}
            />
            <Bar
              dataKey="completed_hours"
              name="Completed Hours"
              radius={[0, 4, 4, 0]}
              barSize={12}
            >
              {chartData.map((row) => (
                <Cell
                  key={row.name}
                  fill={row.color}
                  stroke={row.is_cap_reached ? "#fbbf24" : row.color}
                  strokeWidth={row.is_cap_reached ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
