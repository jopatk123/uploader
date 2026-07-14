/**
 * 图片上传面板
 * 支持 jpg/png/webp，单张上限20MB
 * EXIF 保护策略：原图在限制内时跳过压缩直接上传，完整保留 GPS/拍摄时间等元数据；
 * 仅当原图超限时才压缩，并显式 preserveExif。
 * 通过 type 区分主图（img）与备选图（img_alt）。
 */
import { useState, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import ProgressBar from '@/components/ProgressBar';
import { uploadFile, generateFileId, type UploadProgress } from '@/lib/upload';

interface Props {
  pointId: number | null;
  hasExisting: boolean;
  onUploadComplete: () => void;
  onNeedConfirm: (callback: () => void) => void;
  /** 素材类型：主图 img（默认）/ 备选图 img_alt */
  type?: 'img' | 'img_alt';
}

const IMAGE_MAX_SIZE = 20 * 1024 * 1024; // 20MB
// 超过该阈值才触发画质压缩（避免 Canvas 重绘丢失 EXIF）
const COMPRESS_THRESHOLD = 20 * 1024 * 1024;
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

export default function ImageUploadPanel({
  pointId,
  hasExisting,
  onUploadComplete,
  onNeedConfirm,
  type = 'img',
}: Props) {
  const isAlt = type === 'img_alt';
  const inputId = isAlt ? 'image-input-alt' : 'image-input';

  const [file, setFile] = useState<File | null>(null);
  const [compressProgress, setCompressProgress] = useState(0);
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
      setError(`不支持的图片格式，仅支持 ${ALLOWED_EXTS.join(', ')}`);
      return;
    }

    // 校验大小
    if (selected.size > IMAGE_MAX_SIZE) {
      setError(`图片大小超过20MB限制（当前 ${(selected.size / 1024 / 1024).toFixed(1)}MB）`);
      return;
    }

    setFile(selected);

    // 如果点位已有图片，弹窗确认覆盖
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

      // EXIF 保护：原图在限制内时直接上传，跳过 Canvas 重绘，完整保留元数据
      let uploadBlob: Blob = originalFile;
      const fileId = generateFileId(originalFile);

      if (originalFile.size > COMPRESS_THRESHOLD) {
        // 大图才压缩，并显式保留 EXIF
        setCompressProgress(0);
        uploadBlob = await imageCompression(originalFile, {
          maxSizeMB: 20,
          maxWidthOrHeight: undefined,
          useWebWorker: true,
          preserveExif: true,
          onProgress: (p) => setCompressProgress(p),
        });
        setCompressProgress(100);
      } else {
        // 跳过压缩，直接用原图（完整保留 EXIF）
        setCompressProgress(100);
      }

      // 分片上传（type 区分主图/备选图）
      await uploadFile(
        uploadBlob,
        originalFile.name,
        pointId,
        type,
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
  const isCompressing = compressProgress > 0 && compressProgress < 100;

  const title = isAlt ? '备选图片上传' : '图片上传';
  const accentColor = isAlt ? 'bg-status-yellow' : 'bg-accent';
  const borderColor = isAlt ? 'hover:border-status-yellow' : 'hover:border-accent';
  const hoverBg = isAlt ? 'hover:bg-base-600/30' : 'hover:bg-base-600/30';
  const successText = isAlt ? '备选图片上传成功' : '图片上传成功';

  return (
    <div className={`bg-base-700 border border-base-600 rounded-lg p-5 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono text-sm text-base-100 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${accentColor}`}></span>
          {title}
        </h3>
        {hasExisting && (
          <span className="text-xs text-status-yellow font-mono">已有图片，将覆盖</span>
        )}
      </div>

      <div className="text-xs text-base-400 mb-3 font-mono">
        格式: JPG / PNG / WEBP · 上限: 20MB · 完整保留 EXIF
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        onChange={handleFileSelect}
        disabled={disabled || isUploading || isCompressing}
        className="hidden"
        id={inputId}
      />

      <label
        htmlFor={disabled || isUploading || isCompressing ? '' : inputId}
        className={`
          block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
          ${disabled || isUploading || isCompressing
            ? 'border-base-600 cursor-not-allowed'
            : `border-base-500 ${borderColor} ${hoverBg}`
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
            <p className="text-sm">点击选择{isAlt ? '备选' : ''}图片</p>
            <p className="text-xs text-base-400 mt-1">JPG / PNG / WEBP</p>
          </div>
        )}
      </label>

      {/* 压缩进度 */}
      {compressProgress > 0 && compressProgress < 100 && (
        <div className="mt-4">
          <ProgressBar percent={compressProgress} label="图片压缩中" variant="compress" />
        </div>
      )}

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
          {successText}
        </div>
      )}
    </div>
  );
}
