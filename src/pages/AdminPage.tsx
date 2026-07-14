/**
 * 管理员后台页面
 */
import { useState, useEffect, useCallback } from 'react';
import LoginModal from '@/components/LoginModal';
import MaterialDetailModal from '@/components/MaterialDetailModal';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  adminLogin,
  adminFetchPoints,
  adminFetchPointDetail,
  adminDeleteMaterial,
  getToken,
  setToken,
  clearToken,
} from '@/lib/api';
import type { PointStatus, PointDetail } from '@/types';

type FilterType = 'all' | 'img_only' | 'video_only' | 'completed';

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'img_only', label: '仅传图' },
  { value: 'video_only', label: '仅传视频' },
  { value: 'completed', label: '全部完成' },
];

export default function AdminPage() {
  const [authed, setAuthed] = useState(!!getToken());
  const [points, setPoints] = useState<PointStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [detailPoint, setDetailPoint] = useState<PointDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [clearConfirm, setClearConfirm] = useState<{ id: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPoints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetchPoints(filter);
      setPoints(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败';
      if (msg.includes('Token') || msg.includes('403')) {
        setAuthed(false);
        clearToken();
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (authed) {
      loadPoints();
    }
  }, [authed, loadPoints]);

  const handleLogin = async (password: string) => {
    const token = await adminLogin(password);
    setToken(token);
    setAuthed(true);
  };

  const handleLogout = () => {
    clearToken();
    setAuthed(false);
    setPoints([]);
  };

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setDetailPoint(null);
    try {
      const detail = await adminFetchPointDetail(id);
      setDetailPoint(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleClearAll = async (id: number) => {
    setError(null);
    try {
      // 删除图片
      const point = points.find(p => p.id === id);
      if (point?.has_image) {
        await adminDeleteMaterial(id, 'img');
      }
      if (point?.has_video) {
        await adminDeleteMaterial(id, 'video');
      }
      await loadPoints();
    } catch (err) {
      setError(err instanceof Error ? err.message : '清空失败');
    }
  };

  if (!authed) {
    return <LoginModal onLogin={handleLogin} />;
  }

  const stats = {
    total: points.length,
    hasImage: points.filter(p => p.has_image).length,
    hasVideo: points.filter(p => p.has_video).length,
    completed: points.filter(p => p.has_image && p.has_video).length,
  };

  return (
    <div className="min-h-screen bg-base-900">
      {/* 顶部栏 */}
      <header className="bg-base-800 border-b border-base-600 px-6 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-accent/20 border border-accent/40 flex items-center justify-center">
              <span className="text-accent font-mono font-bold text-sm">A</span>
            </div>
            <div>
              <h1 className="font-mono text-base text-base-100">管理后台</h1>
              <p className="text-xs text-base-400">无人机点位素材管理系统</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="text-xs text-base-300 hover:text-accent transition-colors font-mono border border-base-600 px-3 py-1.5 rounded"
            >
              上传页面 →
            </a>
            <button
              onClick={handleLogout}
              className="text-xs text-status-red hover:text-status-red/80 transition-colors font-mono border border-status-red/30 px-3 py-1.5 rounded"
            >
              退出登录
            </button>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto">
        {/* 统计概览 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="总点位数" value={stats.total} color="text-base-100" />
          <StatCard label="已传图片" value={stats.hasImage} color="text-accent" />
          <StatCard label="已传视频" value={stats.hasVideo} color="text-accent" />
          <StatCard label="全部完成" value={stats.completed} color="text-status-green" />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-status-red/10 border border-status-red/30 rounded text-sm text-status-red">
            {error}
          </div>
        )}

        {/* 筛选栏 */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-base-400 font-mono mr-2">筛选:</span>
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`
                px-3 py-1.5 text-xs font-mono rounded transition-colors
                ${filter === f.value
                  ? 'bg-accent text-base-900 font-medium'
                  : 'bg-base-700 text-base-300 border border-base-600 hover:bg-base-600'
                }
              `}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-base-400 font-mono">
            {loading ? '加载中...' : `共 ${points.length} 条`}
          </span>
        </div>

        {/* 点位列表表格 */}
        <div className="bg-base-700 border border-base-600 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-base-800 border-b border-base-600 text-xs font-mono text-base-400">
                <th className="text-left px-4 py-3">序号</th>
                <th className="text-left px-4 py-3">区县</th>
                <th className="text-left px-4 py-3">岸段类型</th>
                <th className="text-left px-4 py-3">经纬度</th>
                <th className="text-center px-4 py-3">图片</th>
                <th className="text-center px-4 py-3">视频</th>
                <th className="text-left px-4 py-3">最后上传</th>
                <th className="text-center px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-base-400">
                    加载中...
                  </td>
                </tr>
              ) : points.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-base-400">
                    无符合条件的点位
                  </td>
                </tr>
              ) : (
                points.map(p => (
                  <tr
                    key={p.id}
                    className="border-b border-base-600/50 hover:bg-base-600/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-accent">#{p.id}</td>
                    <td className="px-4 py-3 text-base-200">{p.district}</td>
                    <td className="px-4 py-3 text-base-300">{p.shore_type}</td>
                    <td className="px-4 py-3 text-base-400 font-mono text-xs">
                      {p.lon.toFixed(4)}, {p.lat.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={p.has_image ? 'text-status-green' : 'text-status-red'}>
                        {p.has_image ? '✓' : '✗'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={p.has_video ? 'text-status-green' : 'text-status-red'}>
                        {p.has_video ? '✓' : '✗'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-base-400 text-xs font-mono">
                      {p.upload_time || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openDetail(p.id)}
                          className="px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded transition-colors"
                        >
                          查看
                        </button>
                        {(p.has_image || p.has_video) && (
                          <button
                            onClick={() => setClearConfirm({ id: p.id })}
                            className="px-2 py-1 text-xs text-status-red hover:bg-status-red/10 rounded transition-colors"
                          >
                            清空
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* 素材详情弹窗 */}
      {detailPoint && (
        <MaterialDetailModal
          point={detailPoint}
          onClose={() => setDetailPoint(null)}
          onChanged={async () => {
            await loadPoints();
            // 刷新详情
            const updated = await adminFetchPointDetail(detailPoint.id);
            setDetailPoint(updated);
          }}
        />
      )}

      {/* 加载中提示 */}
      {detailLoading && !detailPoint && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="text-base-200 font-mono animate-pulse">加载中...</div>
        </div>
      )}

      {/* 清空确认 */}
      {clearConfirm && (
        <ConfirmDialog
          title="确认清空素材"
          message={`确定清空点位 #${clearConfirm.id} 的全部素材吗？此操作不可撤销。`}
          confirmText="确认清空"
          onConfirm={() => {
            handleClearAll(clearConfirm.id);
            setClearConfirm(null);
          }}
          onCancel={() => setClearConfirm(null)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-base-700 border border-base-600 rounded-lg p-4">
      <div className="text-xs text-base-400 font-mono mb-1">{label}</div>
      <div className={`font-mono text-2xl ${color}`}>{value}</div>
    </div>
  );
}
