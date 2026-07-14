/**
 * 点位状态点阵组件
 * 140个圆点，绿色=图片+视频全部完成，红色=未全部完成
 */
import { useState } from 'react';
import type { PointStatus } from '@/types';

interface Props {
  points: PointStatus[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export default function PointDotGrid({ points, selectedId, onSelect }: Props) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const completedCount = points.filter(p => p.has_image && p.has_video).length;

  return (
    <div className="bg-base-700 border border-base-600 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-mono text-sm text-base-200">
          点位状态总览
          <span className="ml-2 text-base-400">({completedCount}/{points.length} 完成)</span>
        </h3>
        <div className="flex items-center gap-4 text-xs text-base-300">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-status-green"></span>
            全部完成
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-status-red"></span>
            未完成
          </span>
        </div>
      </div>

      <div className="grid grid-cols-28 gap-1.5" style={{ gridTemplateColumns: 'repeat(28, 1fr)' }}>
        {points.map(p => {
          const isComplete = p.has_image && p.has_video;
          const isSelected = p.id === selectedId;
          const isHovered = p.id === hoveredId;

          return (
            <div
              key={p.id}
              className="relative cursor-pointer"
              onMouseEnter={() => setHoveredId(p.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelect(p.id)}
            >
              <div
                className={`
                  w-full aspect-square rounded-full transition-all duration-150
                  ${isComplete ? 'bg-status-green' : 'bg-status-red'}
                  ${isSelected ? 'ring-2 ring-accent ring-offset-2 ring-offset-base-700 scale-110' : ''}
                  ${isHovered ? 'scale-125' : ''}
                  hover:shadow-lg
                `}
                style={isComplete ? { boxShadow: '0 0 6px #22c55e88' } : { boxShadow: '0 0 6px #ef444488' }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-mono text-base-900 font-bold pointer-events-none">
                {p.id}
              </span>

              {isHovered && (
                <div className="dot-tooltip font-mono">
                  <span className="text-accent">#{p.id}</span> {p.district}
                  <br />
                  <span className="text-base-300">{p.shore_type}</span>
                  <br />
                  <span className="text-base-400 text-[10px]">
                    {p.lon.toFixed(4)}, {p.lat.toFixed(4)}
                  </span>
                  <br />
                  <span className="text-base-300 text-[10px]">
                    图: {p.has_image ? '✓' : '✗'} 视频: {p.has_video ? '✓' : '✗'}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
