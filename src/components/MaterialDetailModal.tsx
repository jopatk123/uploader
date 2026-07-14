/**
 * 素材详情弹窗
 * 图片缩略图预览、下载（带进度条）、删除
 */
import { useState } from 'react';
import { adminDownload, adminDeleteMaterial } from '@/lib/api';
import ProgressBar from '@/components/ProgressBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import type { PointDetail } from '@/types';

interface Props {
  point: PointDetail;
  onClose: () => void;
  onChanged: () => void;
}

export default function MaterialDetailModal({ point, onClose, onChanged }: Props) {
  const [downloadType, setDownloadType] = useState<'img' | 'video' | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'img' | 'video' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async (type: 'img' | 'video') => {
    setDownloadType(type);
    setDownloadProgress(0);
    setError(null);

    // 从素材路径提取文件扩展名
    const filePath = type === 'img' ? point.img_path : point.video_path;
    const ext = filePath ? filePath.substring(filePath.lastIndexOf('.')) : '';

    try {
      await adminDownload(point.id, type, ext, (p) => setDownloadProgress(p));
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败');
    } finally {
      setTimeout(() => {
        setDownloadType(null);
        setDownloadProgress(0);
      }, 1000);
    }
  };

  const handleDelete = async (type: 'img' | 'video') => {
    setError(null);
    try {
      await adminDeleteMaterial(point.id, type);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-base-700 border border-base-600 rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-5 border-b border-base-600">
          <div>
            <h3 className="font-mono text-lg text-base-100">
              点位 <span className="text-accent">#{point.id}</span>
            </h3>
            <p className="text-xs text-base-400 mt-0.5">
              {point.city} · {point.district} · {point.shore_type}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-base-400 hover:text-base-100 transition-colors text-xl px-2"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="p-3 bg-status-red/10 border border-status-red/30 rounded text-sm text-status-red">
              {error}
            </div>
          )}

          {/* 图片素材区 */}
          <div className="bg-base-800 border border-base-600 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-mono text-sm text-base-100">图片素材</h4>
              <span className={`text-xs font-mono ${point.has_image ? 'text-status-green' : 'text-status-red'}`}>
                {point.has_image ? '已上传' : '未上传'}
              </span>
            </div>

            {point.has_image && point.img_path ? (
              <div className="space-y-3">
                {/* 图片缩略图预览 */}
                <div className="bg-base-900 rounded-lg overflow-hidden flex items-center justify-center" style={{ maxHeight: '300px' }}>
                  <img
                    src={`/storage/${point.img_path}`}
                    alt={`点位${point.id}图片`}
                    className="max-w-full max-h-300 object-contain"
                    style={{ maxHeight: '300px' }}
                  />
                </div>

                {downloadType === 'img' && (
                  <ProgressBar percent={downloadProgress} label="下载图片中" />
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => handleDownload('img')}
                    disabled={downloadType !== null}
                    className="flex-1 py-2 text-sm bg-accent text-base-900 rounded hover:bg-accent-dark transition-colors disabled:opacity-50 font-medium"
                  >
                    下载图片
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ type: 'img' })}
                    disabled={downloadType !== null}
                    className="px-4 py-2 text-sm text-status-red border border-status-red/30 rounded hover:bg-status-red/10 transition-colors"
                  >
                    删除
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center text-sm text-base-400 py-8">暂无图片素材</div>
            )}
          </div>

          {/* 视频素材区 */}
          <div className="bg-base-800 border border-base-600 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-mono text-sm text-base-100">视频素材</h4>
              <span className={`text-xs font-mono ${point.has_video ? 'text-status-green' : 'text-status-red'}`}>
                {point.has_video ? '已上传' : '未上传'}
              </span>
            </div>

            {point.has_video ? (
              <div className="space-y-3">
                <div className="text-center text-sm text-base-300 py-6 bg-base-900 rounded">
                  视频已上传（不提供在线播放）
                </div>

                {downloadType === 'video' && (
                  <ProgressBar percent={downloadProgress} label="下载视频中" />
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => handleDownload('video')}
                    disabled={downloadType !== null}
                    className="flex-1 py-2 text-sm bg-accent text-base-900 rounded hover:bg-accent-dark transition-colors disabled:opacity-50 font-medium"
                  >
                    下载视频
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ type: 'video' })}
                    disabled={downloadType !== null}
                    className="px-4 py-2 text-sm text-status-red border border-status-red/30 rounded hover:bg-status-red/10 transition-colors"
                  >
                    删除
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center text-sm text-base-400 py-8">暂无视频素材</div>
            )}
          </div>
        </div>
      </div>

      {/* 删除确认 */}
      {deleteConfirm && (
        <ConfirmDialog
          title="确认删除素材"
          message={
            deleteConfirm.type === 'img'
              ? `确定删除点位 #${point.id} 的图片素材吗？此操作不可撤销。`
              : `确定删除点位 #${point.id} 的视频素材吗？此操作不可撤销。`
          }
          confirmText="确认删除"
          onConfirm={() => {
            handleDelete(deleteConfirm.type);
            setDeleteConfirm(null);
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
