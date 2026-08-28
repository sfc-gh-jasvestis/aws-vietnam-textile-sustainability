'use client';

import { useState } from 'react';

// Simplified SVG country outlines - recognizable shapes without external dependencies
const COUNTRY_PATHS: Record<string, { path: string; viewBox: string; cities: Record<string, [number, number]> }> = {
  thailand: {
    viewBox: '0 0 200 340',
    path: 'M95 10 L115 15 L130 25 L140 40 L145 55 L150 70 L155 65 L165 70 L170 80 L160 90 L150 95 L145 105 L140 115 L135 130 L130 140 L125 150 L130 160 L135 170 L130 180 L120 185 L115 195 L120 205 L125 215 L130 225 L125 235 L120 240 L115 250 L110 260 L105 270 L100 280 L95 290 L90 300 L85 310 L80 315 L75 310 L70 300 L65 290 L70 280 L75 270 L80 260 L75 250 L70 240 L65 230 L60 220 L55 210 L50 200 L55 190 L60 180 L65 170 L60 160 L55 150 L60 140 L65 130 L70 120 L65 110 L60 100 L55 90 L60 80 L65 70 L70 60 L75 50 L80 40 L85 30 L90 20 Z',
    cities: {
      'Bangkok': [100, 180], 'Chiang Mai': [90, 60], 'Phuket': [75, 290],
      'Chiang Rai': [105, 40], 'Nakhon Ratchasima': [130, 165],
      'Udon Thani': [115, 110], 'Khon Kaen': [125, 130],
      'Surat Thani': [85, 245], 'Hat Yai': [90, 310],
      'Laem Chabang': [115, 190], 'Rayong': [120, 195],
      'Samui': [95, 250], 'Pattaya': [115, 190],
    },
  },
  indonesia: {
    viewBox: '0 0 400 180',
    path: 'M30 90 L50 85 L70 80 L90 78 L110 80 L130 78 L150 80 L170 82 L185 85 L190 90 L185 95 L170 98 L150 100 L130 98 L110 100 L90 98 L70 100 L50 95 Z M200 70 L220 65 L240 68 L255 72 L250 78 L235 80 L215 78 Z M260 60 L280 55 L300 58 L310 62 L305 68 L290 70 L270 68 Z M320 50 L340 48 L360 52 L370 58 L365 64 L350 66 L330 62 Z M140 110 L160 108 L175 112 L170 118 L155 120 L140 116 Z',
    cities: {
      'Jakarta': [95, 88], 'Surabaya': [170, 84], 'Bandung': [110, 90],
      'Medan': [40, 70], 'Makassar': [250, 65], 'Semarang': [145, 82],
      'Balikpapan': [240, 60], 'Manado': [310, 48], 'Denpasar': [185, 92],
      'Morowali': [275, 58], 'Halmahera': [330, 52], 'Obi Island': [320, 60],
      'Pontianak': [145, 75], 'Palembang': [75, 85],
    },
  },
  malaysia: {
    viewBox: '0 0 300 180',
    path: 'M20 80 L40 75 L60 72 L80 70 L100 72 L120 75 L135 80 L130 88 L115 90 L100 88 L80 90 L60 88 L40 85 L25 85 Z M180 50 L200 45 L220 48 L240 52 L260 55 L270 60 L265 68 L250 72 L230 70 L210 68 L195 65 L185 60 Z',
    cities: {
      'Kuala Lumpur': [75, 82], 'Penang': [40, 72], 'Johor Bahru': [130, 88],
      'Kuching': [195, 58], 'Kota Kinabalu': [260, 55], 'Melaka': [100, 86],
      'Ipoh': [55, 74], 'Kulim': [42, 73], 'Shah Alam': [72, 83],
      'Sabah': [255, 58], 'Sarawak': [210, 60],
    },
  },
  philippines: {
    viewBox: '0 0 200 320',
    path: 'M80 20 L100 18 L115 22 L125 30 L130 42 L128 55 L120 65 L110 70 L100 68 L90 60 L82 50 L78 38 L80 28 Z M70 80 L90 75 L105 78 L115 85 L120 95 L118 108 L110 115 L100 120 L90 118 L80 110 L72 100 L70 90 Z M60 130 L80 125 L95 128 L105 135 L108 145 L105 158 L95 165 L80 168 L68 162 L60 150 L58 140 Z M75 180 L90 178 L100 182 L105 190 L100 200 L90 205 L78 202 L72 192 L75 185 Z M85 220 L100 218 L110 225 L112 235 L108 248 L100 255 L90 258 L80 252 L78 240 L82 230 Z',
    cities: {
      'Manila': [95, 95], 'Cebu': [105, 165], 'Davao': [108, 248],
      'Quezon City': [98, 90], 'Makati': [96, 98], 'Iloilo': [75, 155],
      'Cagayan de Oro': [100, 220], 'Zamboanga': [70, 230],
      'Baguio': [88, 50], 'Clark': [92, 75],
    },
  },
  vietnam: {
    viewBox: '0 0 160 340',
    path: 'M70 10 L85 15 L95 25 L100 40 L95 55 L90 70 L85 85 L80 100 L78 115 L75 130 L72 145 L70 160 L68 175 L72 190 L78 205 L85 220 L92 235 L100 250 L108 265 L115 275 L120 285 L118 295 L110 300 L100 305 L90 308 L80 305 L75 295 L78 285 L82 275 L78 265 L72 255 L65 245 L58 235 L52 225 L48 215 L45 205 L48 195 L52 185 L50 175 L48 165 L50 155 L52 145 L55 135 L58 125 L60 115 L58 105 L55 95 L52 85 L55 75 L58 65 L60 55 L62 45 L65 35 L68 25 Z',
    cities: {
      'Hanoi': [72, 50], 'Ho Chi Minh City': [100, 285], 'Da Nang': [82, 175],
      'Hai Phong': [78, 55], 'Can Tho': [90, 298], 'Nha Trang': [95, 235],
      'Binh Duong': [98, 278], 'Ben Tre': [102, 292], 'Ca Mau': [85, 310],
      'Soc Trang': [92, 302], 'Ninh Thuan': [98, 245], 'Binh Phuoc': [95, 270],
      'Gia Lai': [88, 210], 'Bac Lieu': [87, 305], 'Long An': [95, 290],
      'Quang Ninh': [80, 45],
    },
  },
};

interface MapMarker {
  lat?: number;
  lng?: number;
  label: string;
  value?: string;
  color?: 'green' | 'amber' | 'red' | 'blue' | 'purple';
  size?: 'sm' | 'md' | 'lg';
}

interface MapRoute {
  from: string; // city name
  to: string;   // city name
  label?: string;
  color?: string;
}

interface GeoMapProps {
  country: 'thailand' | 'indonesia' | 'malaysia' | 'philippines' | 'vietnam';
  markers?: MapMarker[];
  routes?: MapRoute[];
  title?: string;
  height?: number;
}

const COLOR_MAP = {
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  blue: '#29B5E8',
  purple: '#8B5CF6',
};

const SIZE_MAP = { sm: 4, md: 6, lg: 9 };

export function GeoMap({ country, markers = [], routes = [], title, height = 300 }: GeoMapProps) {
  const [hoveredMarker, setHoveredMarker] = useState<number | null>(null);
  const countryData = COUNTRY_PATHS[country];

  if (!countryData) return null;

  // Resolve city names to SVG coordinates
  const resolveCity = (name: string): [number, number] | null => {
    return countryData.cities[name] || null;
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {title && <h3 className="mb-2 text-sm font-bold text-slate-700">{title}</h3>}
      <div style={{ height }} className="relative">
        <svg
          viewBox={countryData.viewBox}
          className="h-full w-full"
          style={{ maxHeight: height }}
        >
          {/* Country outline */}
          {countryData.path.split(' M').map((segment, i) => (
            <path
              key={i}
              d={i === 0 ? segment : `M${segment}`}
              fill="#E2E8F0"
              stroke="#94A3B8"
              strokeWidth="1"
            />
          ))}

          {/* Routes */}
          {routes.map((route, i) => {
            const from = resolveCity(route.from);
            const to = resolveCity(route.to);
            if (!from || !to) return null;
            const midX = (from[0] + to[0]) / 2;
            const midY = (from[1] + to[1]) / 2 - 15;
            return (
              <g key={`route-${i}`}>
                <path
                  d={`M${from[0]} ${from[1]} Q${midX} ${midY} ${to[0]} ${to[1]}`}
                  fill="none"
                  stroke={route.color || '#29B5E8'}
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                  opacity="0.7"
                />
                <circle cx={from[0]} cy={from[1]} r="2" fill={route.color || '#29B5E8'} />
                <circle cx={to[0]} cy={to[1]} r="2" fill={route.color || '#29B5E8'} />
              </g>
            );
          })}

          {/* Markers */}
          {markers.map((marker, i) => {
            const pos = resolveCity(marker.label) || [marker.lng, marker.lat];
            const color = COLOR_MAP[marker.color || 'blue'];
            const size = SIZE_MAP[marker.size || 'md'];
            return (
              <g
                key={`marker-${i}`}
                onMouseEnter={() => setHoveredMarker(i)}
                onMouseLeave={() => setHoveredMarker(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Pulse animation ring */}
                <circle
                  cx={pos[0]}
                  cy={pos[1]}
                  r={size + 3}
                  fill={color}
                  opacity="0.2"
                >
                  <animate attributeName="r" values={`${size + 2};${size + 6};${size + 2}`} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
                </circle>
                {/* Main dot */}
                <circle
                  cx={pos[0]}
                  cy={pos[1]}
                  r={size}
                  fill={color}
                  stroke="white"
                  strokeWidth="1.5"
                />
                {/* Tooltip on hover */}
                {hoveredMarker === i && (
                  <g>
                    <rect
                      x={pos[0] + 10}
                      y={pos[1] - 20}
                      width={Math.max(marker.label.length * 5.5, (marker.value?.length || 0) * 5.5, 60)}
                      height={marker.value ? 28 : 18}
                      rx="3"
                      fill="#1E293B"
                      opacity="0.9"
                    />
                    <text x={pos[0] + 14} y={pos[1] - 8} fontSize="7" fill="white" fontWeight="bold">
                      {marker.label}
                    </text>
                    {marker.value && (
                      <text x={pos[0] + 14} y={pos[1] + 2} fontSize="6" fill="#94A3B8">
                        {marker.value}
                      </text>
                    )}
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        {markers.length > 0 && (
          <div className="absolute bottom-1 right-1 rounded bg-white/90 px-2 py-1 text-[10px] text-slate-600 shadow-sm">
            {Array.from(new Set(markers.map(m => m.color || 'blue'))).map(color => (
              <span key={color} className="mr-2 inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COLOR_MAP[color as keyof typeof COLOR_MAP] }} />
                {color === 'green' ? 'Normal' : color === 'amber' ? 'Warning' : color === 'red' ? 'Critical' : color === 'purple' ? 'Predicted' : 'Active'}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
