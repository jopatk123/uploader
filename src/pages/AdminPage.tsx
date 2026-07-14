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
  adminBatchDownload,
  getToken,
  setToken,
  clearToken,
} from '@/lib/api';
import type { PointStatus, PointDetail, MaterialType } from '@/types';

type FilterType = 'all' | 'img_only' | 'video_only' | 'completed';

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'img_only', label: '仅传图' },
  { value: 'video_only', label: '仅传视频' },
  { value: 'completed', label: '主图+主视频' },
];

/** 批量下载类型选项 */
const BATCH_TYPES: { type: MaterialType; label: string; shortLabel: string }[] = [
  { type: 'img', label: '主图片', shortLabel: '图片' },
  { type: 'img_alt', label: '备选图片', shortLabel: '备图' },
  { type: 'video', label: '主视频', shortLabel: '视频' },
  { type: 'video_alt', label: '备选视频', shortLabel: '备视频' },
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
  const [batchDownloading, setBatchDownloading] = useState<MaterialType | null>(null);
  const [batchMsg, setBatchMsg] = useState<string | null>(null);

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
      // 清空4种素材
      const point = points.find(p => p.id === id);
      if (!point) return;
      const types: MaterialType[] = ['img', 'img_alt', 'video', 'video_alt'];
      for (const t of types) {
        const hasKey = t === 'img' ? 'has_image'
          : t === 'img_alt' ? 'has_image_alt'
          : t === 'video' ? 'has_video'
          : 'has_video_alt';
        if (point[hasKey]) {
          await adminDeleteMaterial(id, t);
        }
      }
      await loadPoints();
    } catch (err) {
      setError(err instanceof Error ? err.message : '清空失败');
    }
  };

  const handleBatchDownload = async (type: MaterialType) => {
    const meta = BATCH_TYPES.find(b => b.type === type)!;
    const hasKey = type === 'img' ? 'has_image'
      : type === 'img_alt' ? 'has_image_alt'
      : type === 'video' ? 'has_video'
      : 'has_video_alt';
    const count = points.filter(p => p[hasKey]).length;

    if (count === 0) {
      setBatchMsg(`暂无已上传的${meta.label}素材`);
      setTimeout(() => setBatchMsg(null), 3000);
      return;
    }

    setBatchDownloading(type);
    setBatchMsg(null);
    setError(null);
    try {
      const result = await adminBatchDownload(type);
      setBatchMsg(`${meta.label}批量下载完成：${result.zipName}`);
      setTimeout(() => setBatchMsg(null), 5000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : `${meta.label}批量下载失败`;
      setError(msg);
    } finally {
      setBatchDownloading(null);
    }
  };

  if (!authed) {
    return <LoginModal onLogin={handleLogin} />;
  }

  const stats = {
    total: points.length,
    hasImage: points.filter(p => p.has_image).length,
    hasImageAlt: points.filter(p => p.has_image_alt).length,
    hasVideo: points.filter(p => p.has_video).length,
    hasVideoAlt: points.filter(p => p.has_video_alt).length,
    completed: points.filter(p => p.has_image && p.has_video).length,
  };

  const statsByType: Record<MaterialType, number> = {
    img: stats.hasImage,
    img_alt: stats.hasImageAlt,
    video: stats.hasVideo,
    video_alt: stats.hasVideoAlt,
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
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          <StatCard label="总点位数" value={stats.total} color="text-base-100" />
          <StatCard label="主图片" value={stats.hasImage} color="text-accent" />
          <StatCard label="备选图片" value={stats.hasImageAlt} color="text-status-yellow" />
          <StatCard label="主视频" value={stats.hasVideo} color="text-accent" />
          <StatCard label="备选视频" value={stats.hasVideoAlt} color="text-status-yellow" />
          <StatCard label="主图+主视频" value={stats.completed} color="text-status-green" />
        </div>

        {/* 批量下载工具栏 */}
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-base-700 border border-base-600 rounded-lg">
          <span className="text-xs text-base-400 font-mono">批量下载:</span>
          {BATCH_TYPES.map(bt => {
            const count = statsByType[bt.type];
            const isDownloading = batchDownloading === bt.type;
            const isAlt = bt.type.endsWith('_alt');
            const colorClass = isAlt
              ? 'bg-status-yellow/20 border-status-yellow/40 text-status-yellow hover:bg-status-yellow/30'
              : 'bg-accent/20 border-accent/40 text-accent hover:bg-accent/30';
            return (
              <button
                key={bt.type}
                onClick={() => handleBatchDownload(bt.type)}
                disabled={batchDownloading !== null || count === 0}
                className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 ${colorClass}`}
              >
                {isDownloading && (
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                )}
                {isDownloading ? `打包${bt.shortLabel}中...` : `${bt.label} (${count})`}
              </button>
            );
          })}
          {batchMsg && (
            <span className="text-xs text-status-green font-mono ml-auto">{batchMsg}</span>
          )}
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
        <div className="bg-base-700 border border-base-600 rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-base-800 border-b border-base-600 text-xs font-mono text-base-400">
                <th className="text-left px-4 py-3">序号</th>
                <th className="text-left px-4 py-3">区县</th>
                <th className="text-left px-4 py-3">岸段类型</th>
                <th className="text-left px-4 py-3">经纬度</th>
                <th className="text-center px-2 py-3">
                  主图
                  <div className="text-[10px] text-base-500 mt-0.5">备图</div>
                </th>
                <th className="text-center px-2 py-3">
                  主视频
                  <div className="text-[10px] text-base-500 mt-0.5">备视频</div>
                </th>
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
                points.map(p => {
                  const hasAny = p.has_image || p.has_image_alt || p.has_video || p.has_video_alt;
                  return (
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
                      <td className="px-2 py-3 text-center">
                        <div className="flex flex-col items-center gap-0.5 leading-none">
                          <span className={p.has_image ? 'text-status-green' : 'text-status-red'}>
                            {p.has_image ? '✓' : '✗'}
                          </span>
                          <span className={`text-[10px] ${p.has_image_alt ? 'text-status-green' : 'text-status-red'}`}>
                            {p.has_image_alt ? '✓' : '✗'}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-center">
                        <div className="flex flex-col items-center gap-0.5 leading-none">
                          <span className={p.has_video ? 'text-status-green' : 'text-status-red'}>
                            {p.has_video ? '✓' : '✗'}
                          </span>
                          <span className={`text-[10px] ${p.has_video_alt ? 'text-status-green' : 'text-status-red'}`}>
                            {p.has_video_alt ? '✓' : '✗'}
                          </span>
                        </div>
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
                          {hasAny && (
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
                  );
                })
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
          message={`确定清空点位 #${clearConfirm.id} 的全部素材（主图/备图/主视频/备视频）吗？此操作不可撤销。`}
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
    <div className="bg-base-700 border border-base-600 rounded-lg p-3">
      <div className="text-xs text-base-400 font-mono mb-1">{label}</div>
      <div className={`font-mono text-2xl ${color}`}>{value}</div>
    </div>
  );
}
