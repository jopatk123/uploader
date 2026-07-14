/**
 * 视频上传面板
 * 仅 mp4，≥100MB直接拦截并弹窗指引，不做任何压缩，分片上传
 */
import { useState, useRef } from 'react';
import ProgressBar from '@/components/ProgressBar';
import { uploadFile, generateFileId, type UploadProgress } from '@/lib/upload';

interface Props {
  pointId: number | null;
  hasExisting: boolean;
  onUploadComplete: () => void;
  onNeedConfirm: (callback: () => void) => void;
  onOverLimit: () => void;
}

const VIDEO_MAX_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_EXTS = ['.mp4'];

export default function VideoUploadPanel({
  pointId,
  hasExisting,
  onUploadComplete,
  onNeedConfirm,
  onOverLimit,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const disabled = pointId === null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setError(null);
    setSuccess(false);
    setUploadProgress(null);

    // 校验格式
    const ext = selected.name.substring(selected.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      setError(`不支持的视频格式，仅支持 MP4`);
      return;
    }

    // 校验大小：≥100MB直接拦截
    if (selected.size >= VIDEO_MAX_SIZE) {
      onOverLimit();
      return;
    }

    setFile(selected);

    // 如果点位已有视频，弹窗确认覆盖
    if (hasExisting) {
      onNeedConfirm(() => doUpload(selected));
    } else {
      doUpload(selected);
    }
  };

  const doUpload = async (originalFile: File) => {
    if (!pointId) return;

    try {
      setSuccess(false);
      setError(null);

      const fileId = generateFileId(originalFile);
      await uploadFile(
        originalFile,
        originalFile.name,
        pointId,
        'video',
        fileId,
        (progress) => setUploadProgress(progress)
      );

      setSuccess(true);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onUploadComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    }
  };

  const handleRetry = () => {
    if (file) {
      doUpload(file);
    }
  };

  const isUploading = uploadProgress?.phase === 'uploading' || uploadProgress?.phase === 'merging';

  return (
    <div className={`bg-base-700 border border-base-600 rounded-lg p-5 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono text-sm text-base-100 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent"></span>
          视频上传
        </h3>
        {hasExisting && (
          <span className="text-xs text-status-yellow font-mono">已有视频，将覆盖</span>
        )}
      </div>

      <div className="text-xs text-base-400 mb-3 font-mono">
        格式: MP4 · 上限: 100MB · 不做压缩
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".mp4,video/mp4"
        onChange={handleFileSelect}
        disabled={disabled || isUploading}
        className="hidden"
        id="video-input"
      />

      <label
        htmlFor={disabled || isUploading ? '' : 'video-input'}
        className={`
          block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
          ${disabled || isUploading
            ? 'border-base-600 cursor-not-allowed'
            : 'border-base-500 hover:border-accent hover:bg-base-600/30'
          }
        `}
      >
        {file ? (
          <div className="text-base-200">
            <p className="font-mono text-sm">{file.name}</p>
            <p className="text-xs text-base-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        ) : (
          <div className="text-base-300">
            <p className="text-sm">点击选择视频</p>
            <p className="text-xs text-base-400 mt-1">MP4 · 最大 100MB</p>
          </div>
        )}
      </label>

      {/* 上传进度 */}
      {uploadProgress && (
        <div className="mt-4">
          <ProgressBar
            percent={uploadProgress.percent}
            label={uploadProgress.message}
          />
        </div>
      )}

      {/* 状态提示 */}
      {error && (
        <div className="mt-4 p-3 bg-status-red/10 border border-status-red/30 rounded text-sm text-status-red flex items-center justify-between">
          <span>{error}</span>
          {file && (
            <button
              onClick={handleRetry}
              className="ml-3 px-3 py-1 text-xs bg-status-red/20 rounded hover:bg-status-red/30 transition-colors"
            >
              重试
            </button>
          )}
        </div>
      )}

      {success && (
        <div className="mt-4 p-3 bg-status-green/10 border border-status-green/30 rounded text-sm text-status-green">
          视频上传成功
        </div>
      )}
    </div>
  );
}
