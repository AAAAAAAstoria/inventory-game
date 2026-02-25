/**
 * Files.tsx — 文件存储管理页面
 *
 * 功能：
 *   - 拖拽/点击上传文件（支持多种格式，最大 50MB）
 *   - 文件列表展示（名称、大小、类型、上传时间、上传者）
 *   - 文件下载（预签名 URL）
 *   - 文件删除（带确认）
 *   - 文件描述/分类编辑
 *   - 按分类筛选
 */

import { trpc } from "@/lib/trpc";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

// ─── 工具函数 ──────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getMimeIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType === "application/pdf") return "📄";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv") return "📊";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "📑";
  if (mimeType.includes("word") || mimeType.includes("document")) return "📝";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType === "application/zip") return "🗜️";
  if (mimeType === "application/json" || mimeType === "text/plain") return "📃";
  return "📎";
}

function getMimeColor(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "#a78bfa";
  if (mimeType === "application/pdf") return "#ef4444";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv") return "#22c55e";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "#f97316";
  if (mimeType.includes("word") || mimeType.includes("document")) return "#38bdf8";
  if (mimeType.startsWith("video/")) return "#ec4899";
  if (mimeType.startsWith("audio/")) return "#f59e0b";
  return "#6b7280";
}

const CATEGORIES = [
  { value: "all", label: "全部" },
  { value: "general", label: "通用" },
  { value: "game-result", label: "游戏结果" },
  { value: "report", label: "报告" },
  { value: "data", label: "数据" },
  { value: "image", label: "图片" },
  { value: "other", label: "其他" },
];

// ─── 文件上传区 ────────────────────────────────────────────────

function UploadZone({ onUploaded }: { onUploaded: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [category, setCategory] = useState("general");
  const [description, setDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.files.upload.useMutation({
    onSuccess: () => {
      toast.success("文件上传成功");
      setDescription("");
      onUploaded();
    },
    onError: (err) => {
      toast.error("上传失败：" + err.message);
    },
  });

  const processFile = useCallback(
    async (file: File) => {
      if (uploading) return;
      setUploading(true);
      setUploadProgress(`正在读取 ${file.name}...`);

      try {
        // 读取文件为 base64
        const base64Content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e.target?.result as string;
            // 去掉 data:xxx;base64, 前缀
            const base64 = result.split(",")[1];
            if (!base64) reject(new Error("文件读取失败"));
            else resolve(base64);
          };
          reader.onerror = () => reject(new Error("文件读取错误"));
          reader.readAsDataURL(file);
        });

        setUploadProgress(`正在上传 ${file.name}...`);

        await uploadMutation.mutateAsync({
          originalName: file.name,
          mimeType: file.type || "application/octet-stream",
          base64Content,
          fileSize: file.size,
          description: description || undefined,
          category,
        });
      } catch (err) {
        if (!(err instanceof Error && err.message.includes("TRPC"))) {
          toast.error("处理文件失败：" + String(err));
        }
      } finally {
        setUploading(false);
        setUploadProgress("");
      }
    },
    [uploading, uploadMutation, description, category]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        processFile(file);
        e.target.value = "";
      }
    },
    [processFile]
  );

  return (
    <div className="game-card">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-primary text-base">⬆️</span>
        <h2 className="text-sm font-semibold text-foreground">上传文件</h2>
        <span className="text-xs text-muted-foreground ml-1">最大 50MB</span>
      </div>

      {/* 拖拽区域 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-primary bg-primary/10"
            : "border-border hover:border-primary/50 hover:bg-primary/5"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept="image/*,.pdf,.csv,.json,.txt,.xlsx,.xls,.pptx,.ppt,.docx,.doc,.zip,.mp4,.webm,.mp3,.wav"
        />
        {uploading ? (
          <div className="space-y-2">
            <div className="text-2xl animate-bounce">⬆️</div>
            <div className="text-sm text-primary font-medium">{uploadProgress}</div>
            <div className="w-full bg-border rounded-full h-1.5">
              <div className="bg-primary h-1.5 rounded-full animate-pulse w-2/3" />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-3xl">{isDragging ? "📂" : "📁"}</div>
            <div className="text-sm text-foreground font-medium">
              {isDragging ? "松开以上传" : "拖拽文件到此处，或点击选择"}
            </div>
            <div className="text-xs text-muted-foreground">
              支持图片、PDF、Excel、Word、PPT、CSV、JSON、视频、音频、ZIP
            </div>
          </div>
        )}
      </div>

      {/* 上传选项 */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">分类</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full text-xs bg-input border border-border rounded px-2 py-1.5 text-foreground"
          >
            {CATEGORIES.filter((c) => c.value !== "all").map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">描述（可选）</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="文件描述..."
            className="w-full text-xs bg-input border border-border rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>
    </div>
  );
}

// ─── 文件列表项 ────────────────────────────────────────────────

type FileItem = {
  id: number;
  fileKey: string;
  url: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  uploadedByName: string | null;
  description: string | null;
  category: string | null;
  createdAt: Date;
};

function FileRow({
  file,
  onDeleted,
  onUpdated,
}: {
  file: FileItem;
  onDeleted: () => void;
  onUpdated: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDesc, setEditDesc] = useState(file.description ?? "");
  const [editCat, setEditCat] = useState(file.category ?? "general");
  const [isDeleting, setIsDeleting] = useState(false);

  const getUrlQuery = trpc.files.getUrl.useQuery(
    { id: file.id },
    { enabled: false, retry: false }
  );

  const deleteMutation = trpc.files.delete.useMutation({
    onSuccess: () => {
      toast.success("文件已删除");
      onDeleted();
    },
    onError: (err) => toast.error("删除失败：" + err.message),
  });

  const updateMutation = trpc.files.update.useMutation({
    onSuccess: () => {
      toast.success("已保存");
      setIsEditing(false);
      onUpdated();
    },
    onError: (err) => toast.error("保存失败：" + err.message),
  });

  const handleDownload = async () => {
    try {
      const result = await getUrlQuery.refetch();
      if (result.data?.url) {
        const a = document.createElement("a");
        a.href = result.data.url;
        a.download = file.originalName;
        a.target = "_blank";
        a.click();
      }
    } catch {
      // 如果预签名 URL 失败，直接用原始 URL
      window.open(file.url, "_blank");
    }
  };

  const handleDelete = () => {
    if (!isDeleting) {
      setIsDeleting(true);
      return;
    }
    deleteMutation.mutate({ id: file.id });
  };

  const color = getMimeColor(file.mimeType);
  const icon = getMimeIcon(file.mimeType);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="rounded-lg border border-border bg-card/50 p-3 hover:border-border/80 transition-colors"
    >
      <div className="flex items-start gap-3">
        {/* 文件图标 */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-xl"
          style={{ background: `${color}15`, border: `1px solid ${color}30` }}
        >
          {icon}
        </div>

        {/* 文件信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{file.originalName}</div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-muted-foreground font-mono">{formatFileSize(file.fileSize)}</span>
                <span className="text-xs" style={{ color }}>{file.mimeType.split("/")[1]?.toUpperCase()}</span>
                {file.category && file.category !== "general" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                    {CATEGORIES.find((c) => c.value === file.category)?.label ?? file.category}
                  </span>
                )}
              </div>
              {file.description && (
                <div className="text-xs text-muted-foreground mt-1 truncate">{file.description}</div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={handleDownload}
                className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                title="下载"
              >
                ⬇️
              </button>
              <button
                onClick={() => { setIsEditing(!isEditing); setIsDeleting(false); }}
                className="p-1.5 rounded hover:bg-amber-400/10 text-muted-foreground hover:text-amber-400 transition-colors"
                title="编辑"
              >
                ✏️
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className={`p-1.5 rounded transition-colors ${
                  isDeleting
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "hover:bg-red-400/10 text-muted-foreground hover:text-red-400"
                }`}
                title={isDeleting ? "再次点击确认删除" : "删除"}
                onBlur={() => setTimeout(() => setIsDeleting(false), 200)}
              >
                {isDeleting ? "确认?" : "🗑️"}
              </button>
            </div>
          </div>

          {/* 元数据行 */}
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
            <span>📅 {formatDate(file.createdAt)}</span>
            {file.uploadedByName && <span>👤 {file.uploadedByName}</span>}
          </div>

          {/* 编辑面板 */}
          <AnimatePresence>
            {isEditing && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">分类</label>
                      <select
                        value={editCat}
                        onChange={(e) => setEditCat(e.target.value)}
                        className="w-full text-xs bg-input border border-border rounded px-2 py-1 text-foreground"
                      >
                        {CATEGORIES.filter((c) => c.value !== "all").map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">描述</label>
                      <input
                        type="text"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className="w-full text-xs bg-input border border-border rounded px-2 py-1 text-foreground"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        updateMutation.mutate({
                          id: file.id,
                          description: editDesc || null,
                          category: editCat,
                        })
                      }
                      disabled={updateMutation.isPending}
                      className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {updateMutation.isPending ? "保存中..." : "保存"}
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1 border border-border rounded text-xs text-muted-foreground hover:text-foreground"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────

export default function FilesPage() {
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error, refetch } = trpc.files.list.useQuery(
    { limit: 200, offset: 0 },
    { refetchOnWindowFocus: false }
  );

  const files = data?.files ?? [];

  // 过滤
  const filtered = files.filter((f) => {
    const matchCat = filterCategory === "all" || f.category === filterCategory;
    const matchSearch =
      !searchQuery ||
      f.originalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.description ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  // 统计
  const totalSize = files.reduce((s, f) => s + f.fileSize, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center hover:bg-primary/30 transition-colors"
            title="返回游戏"
          >
            <span className="text-primary text-sm">←</span>
          </a>
          <div>
            <h1 className="text-sm font-semibold text-foreground leading-none">文件存储库</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {files.length} 个文件 · {formatFileSize(totalSize)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/"
            className="px-3 py-1 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center gap-1"
          >
            <span>📦</span>
            <span className="hidden sm:inline">返回游戏</span>
          </a>
        </div>
      </div>

      <div className="container py-4">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          {/* 左侧：上传区 + 统计 */}
          <div className="space-y-4">
            <UploadZone onUploaded={() => refetch()} />

            {/* 存储统计 */}
            <div className="game-card">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-primary text-base">📊</span>
                <h2 className="text-sm font-semibold text-foreground">存储统计</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg p-3 border border-border bg-card/50 text-center">
                  <div className="font-mono text-xl font-bold text-primary">{files.length}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">文件总数</div>
                </div>
                <div className="rounded-lg p-3 border border-border bg-card/50 text-center">
                  <div className="font-mono text-xl font-bold text-primary">{formatFileSize(totalSize)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">总占用空间</div>
                </div>
              </div>
              {/* 分类统计 */}
              <div className="mt-3 space-y-1.5">
                {CATEGORIES.filter((c) => c.value !== "all").map((cat) => {
                  const count = files.filter((f) => f.category === cat.value).length;
                  if (count === 0) return null;
                  return (
                    <div key={cat.value} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{cat.label}</span>
                      <span className="font-mono text-foreground">{count} 个</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 右侧：文件列表 */}
          <div className="space-y-4">
            {/* 搜索和筛选 */}
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索文件名或描述..."
                className="flex-1 min-w-[200px] text-sm bg-input border border-border rounded px-3 py-1.5 text-foreground placeholder:text-muted-foreground"
              />
              <div className="flex gap-1 flex-wrap">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setFilterCategory(cat.value)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      filterCategory === cat.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 文件列表 */}
            {isLoading ? (
              <div className="game-card text-center py-12">
                <div className="text-2xl animate-spin mb-2">⟳</div>
                <div className="text-sm text-muted-foreground">加载中...</div>
              </div>
            ) : error ? (
              <div className="game-card text-center py-12">
                <div className="text-2xl mb-2">⚠️</div>
                <div className="text-sm text-red-400">加载失败：{error.message}</div>
                <button
                  onClick={() => refetch()}
                  className="mt-3 px-4 py-1.5 bg-primary text-primary-foreground rounded text-xs"
                >
                  重试
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="game-card text-center py-12">
                <div className="text-3xl mb-3">📭</div>
                <div className="text-sm text-muted-foreground">
                  {files.length === 0 ? "暂无文件，上传第一个文件开始使用" : "没有符合条件的文件"}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground px-1">
                  共 {filtered.length} 个文件
                  {filterCategory !== "all" || searchQuery ? `（已筛选，共 ${files.length} 个）` : ""}
                </div>
                <AnimatePresence mode="popLayout">
                  {filtered.map((file) => (
                    <FileRow
                      key={file.id}
                      file={file as FileItem}
                      onDeleted={() => refetch()}
                      onUpdated={() => refetch()}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
