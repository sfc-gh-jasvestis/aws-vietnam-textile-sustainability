import { NextResponse } from 'next/server';

export async function GET() {
  // Placeholder data - in production, this queries Snowflake via the connector
  return NextResponse.json({
    timeseries: Array.from({ length: 30 }, (_, i) => ({
      period: `Day ${i + 1}`,
      value: Math.round(80 + Math.random() * 20),
    })),
    categories: [
      { category: 'Category A', count: 45 },
      { category: 'Category B', count: 32 },
      { category: 'Category C', count: 28 },
      { category: 'Category D', count: 15 },
    ],
    entities: Array.from({ length: 10 }, (_, i) => ({
      id: `ENT-${String(i + 1).padStart(3, '0')}`,
      name: `Entity ${i + 1}`,
      status: ['HEALTHY', 'HEALTHY', 'WARNING', 'CRITICAL'][Math.floor(Math.random() * 4)],
      value: `$${Math.round(Math.random() * 1000)}K`,
    })),
    detail: Array.from({ length: 14 }, (_, i) => ({
      x: `Day ${i + 1}`,
      y: Math.round(70 + Math.random() * 30),
    })),
    breakdown: [
      { label: 'Type A', value: 42 },
      { label: 'Type B', value: 28 },
      { label: 'Type C', value: 18 },
      { label: 'Type D', value: 12 },
    ],
  });
}
