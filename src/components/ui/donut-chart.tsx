"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface DonutChartProps {
  /** e.g. [{ name: 'Done', value: 5 }, { name: 'Remaining', value: 5 }] */
  data: { name: string; value: number; color: string }[];
  /** Center label e.g. "5/10" or "80%" */
  centerLabel?: string;
  size?: number;
}

export function DonutChart({
  data,
  centerLabel = "",
  size = 64,
}: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const displayData = data.filter((d) => d.value > 0);
  if (displayData.length === 0 && total === 0) {
    displayData.push({ name: "None", value: 1, color: "rgba(255,255,255,0.1)" });
  }

  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={displayData}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.35}
            outerRadius={size * 0.48}
            paddingAngle={0}
            dataKey="value"
          >
            {displayData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {centerLabel !== "" && (
        <div
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-xs font-medium text-foreground"
          style={{ fontSize: size * 0.18 }}
        >
          {centerLabel}
        </div>
      )}
    </div>
  );
}
