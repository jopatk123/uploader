/**
 * 点位状态点阵组件
 * 140个圆点，绿色=图片+视频全部完成，红色=未全部完成
 * 点阵上方增加按区域（区县）分组的统计，一眼看出各区域完成进度
 */
import { useState, useMemo } from 'react';
import type { PointStatus } from '@/types';

interface Props {
  points: PointStatus[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

interface RegionStat {
  name: string;
  total: number;
  completed: number;
}

export default function PointDotGrid({ points, selectedId, onSelect }: Props) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const completedCount = points.filter(p => p.has_image && p.has_video).length;

  // 按区县分组统计
  const regionStats = useMemo<RegionStat[]>(() => {
    const map = new Map<string, RegionStat>();
    for (const p of points) {
      let stat = map.get(p.district);
      if (!stat) {
        stat = { name: p.district, total: 0, completed: 0 };
        map.set(p.district, stat);
      }
      stat.total++;
      if (p.has_image && p.has_video) stat.completed++;
    }
    // 按总数降序排列
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [points]);

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

      {/* 按区域分组统计 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {regionStats.map(r => {
          const percent = r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0;
          const isAllDone = r.completed === r.total;
          return (
            <div
              key={r.name}
              className="bg-base-800 border border-base-600 rounded-lg p-3"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-xs text-base-100 truncate">{r.name}</span>
                <span className={`font-mono text-xs ${isAllDone ? 'text-status-green' : 'text-base-400'}`}>
                  {r.completed}/{r.total}
                </span>
              </div>
              <div className="h-1.5 bg-base-900 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isAllDone ? 'bg-status-green' : 'bg-accent'}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] text-base-400 font-mono">
                {isAllDone ? '已完成' : `缺 ${r.total - r.completed} 个`}
              </div>
            </div>
          );
        })}
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
