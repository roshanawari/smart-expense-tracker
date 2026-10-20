"use client";

import React, { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatMoney } from "@/lib/money";

export const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  Food: "#F97316",
  Travel: "#0EA5E9",
  Shopping: "#EC4899",
  Bills: "#8B5CF6",
  Other: "#64748B",
};

interface CategorySpend {
  categoryId: string;
  categoryName: string;
  amountMinor: number;
  percentage: number;
}

interface MonthHistory {
  month: string;
  label: string;
  incomeMinor: number;
  expensesMinor: number;
  balanceMinor: number;
}

export function ExpensePieChart({ data }: { data: CategorySpend[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-64 flex items-center justify-center text-slate-400">Loading chart...</div>;
  }

  if (!data || data.length === 0 || data.every((d) => d.amountMinor === 0)) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-center p-4">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
          📊
        </div>
        <p className="text-sm font-medium text-slate-600">No data for this month</p>
        <p className="text-xs text-slate-400 mt-0.5">Add expense transactions to see your spending breakdown.</p>
      </div>
    );
  }

  const chartData = data.map((item) => ({
    name: item.categoryName,
    value: item.amountMinor / 100, // display in rupees
    amountMinor: item.amountMinor,
    percentage: item.percentage,
    color: EXPENSE_CATEGORY_COLORS[item.categoryName] || "#0F766E",
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="#fff" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: any, name: any, item: any) => [
                formatMoney(item.payload.amountMinor),
                name,
              ]}
              contentStyle={{
                backgroundColor: "#fff",
                borderRadius: "8px",
                border: "1px solid #E2E8F0",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                fontSize: "12px",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100">
        {chartData.map((item) => (
          <div key={item.name} className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-700 truncate">{item.name}</p>
              <p className="text-xs text-slate-500 font-mono">
                {formatMoney(item.amountMinor)} ({item.percentage}%)
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function IncomeVsExpenseBarChart({ data }: { data: MonthHistory[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-64 flex items-center justify-center text-slate-400">Loading chart...</div>;
  }

  const hasAnyData = data && data.some((d) => d.incomeMinor > 0 || d.expensesMinor > 0);

  if (!hasAnyData) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-center p-4">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
          📈
        </div>
        <p className="text-sm font-medium text-slate-600">No data for this month</p>
        <p className="text-xs text-slate-400 mt-0.5">No income or expense transactions in the last 6 months.</p>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: d.label.split(" ")[0], // Short month name
    fullLabel: d.label,
    Income: d.incomeMinor / 100,
    Expense: d.expensesMinor / 100,
    incomeMinor: d.incomeMinor,
    expensesMinor: d.expensesMinor,
  }));

  return (
    <div className="h-72 w-full pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: "#64748B" }}
            axisLine={{ stroke: "#CBD5E1" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#64748B" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(val) => `₹${val}`}
          />
          <Tooltip
            formatter={(val: any, name: any, item: any) => {
              const amountMinor =
                name === "Income" ? item.payload.incomeMinor : item.payload.expensesMinor;
              return [formatMoney(amountMinor), name];
            }}
            labelFormatter={(_, items) => items?.[0]?.payload?.fullLabel || ""}
            contentStyle={{
              backgroundColor: "#fff",
              borderRadius: "8px",
              border: "1px solid #E2E8F0",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              fontSize: "12px",
            }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            wrapperStyle={{ fontSize: "12px", paddingBottom: "10px" }}
          />
          <Bar dataKey="Income" fill="#16A34A" radius={[4, 4, 0, 0]} maxBarSize={32} />
          <Bar dataKey="Expense" fill="#DC2626" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
