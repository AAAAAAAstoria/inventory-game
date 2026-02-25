/**
 * files.ts — 文件存储 tRPC 路由
 *
 * 提供以下 procedure：
 *   files.upload   — 上传文件（base64 编码内容）→ S3 + 数据库记录
 *   files.list     — 列出所有文件（分页）
 *   files.getUrl   — 获取文件下载 URL（预签名）
 *   files.delete   — 删除文件（S3 + 数据库）
 *   files.update   — 更新文件描述/分类
 */

import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { deleteFile, getFileById, insertFile, listFiles, updateFileMetadata } from "../db";
import { storagePut, storageGet } from "../storage";
import { publicProcedure, router } from "../_core/trpc";

// 允许的 MIME 类型白名单
const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "text/plain", "text/csv",
  "application/json",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "video/mp4", "video/webm",
  "audio/mpeg", "audio/wav",
];

// 最大文件大小：50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const filesRouter = router({
  /**
   * 上传文件
   * 接受 base64 编码的文件内容，上传到 S3 并在数据库中记录元数据
   */
  upload: publicProcedure
    .input(
      z.object({
        /** 原始文件名 */
        originalName: z.string().min(1).max(255),
        /** MIME 类型 */
        mimeType: z.string().min(1).max(128),
        /** base64 编码的文件内容（不含 data:xxx;base64, 前缀） */
        base64Content: z.string().min(1),
        /** 文件大小（字节），由客户端提供用于校验 */
        fileSize: z.number().int().positive(),
        /** 可选描述 */
        description: z.string().max(500).optional(),
        /** 文件分类标签 */
        category: z.string().max(64).default("general"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // 校验 MIME 类型
      if (!ALLOWED_MIME_TYPES.includes(input.mimeType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `不支持的文件类型：${input.mimeType}`,
        });
      }

      // 校验文件大小
      if (input.fileSize > MAX_FILE_SIZE) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `文件过大：${(input.fileSize / 1024 / 1024).toFixed(1)}MB，最大允许 50MB`,
        });
      }

      // 解码 base64 内容
      let fileBuffer: Buffer;
      try {
        fileBuffer = Buffer.from(input.base64Content, "base64");
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "文件内容解码失败，请确保使用 base64 编码",
        });
      }

      // 生成唯一 S3 key（避免文件名冲突和枚举攻击）
      const ext = input.originalName.includes(".")
        ? "." + input.originalName.split(".").pop()!.toLowerCase()
        : "";
      const uniqueId = nanoid(12);
      const fileKey = `inventory-game/files/${uniqueId}${ext}`;

      // 上传到 S3
      let uploadResult: { key: string; url: string };
      try {
        uploadResult = await storagePut(fileKey, fileBuffer, input.mimeType);
      } catch (err) {
        console.error("[Storage] Upload failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "文件上传失败，请稍后重试",
        });
      }

      // 写入数据库
      const user = ctx.user;
      await insertFile({
        fileKey: uploadResult.key,
        url: uploadResult.url,
        originalName: input.originalName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        uploadedBy: user?.id ?? null,
        uploadedByName: user?.name ?? null,
        description: input.description ?? null,
        category: input.category,
      });

      return {
        success: true,
        fileKey: uploadResult.key,
        url: uploadResult.url,
        originalName: input.originalName,
      };
    }),

  /**
   * 列出文件（分页）
   */
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const { limit = 50, offset = 0 } = input ?? {};
      const records = await listFiles(limit, offset);
      return {
        files: records.map(f => ({
          id: f.id,
          fileKey: f.fileKey,
          url: f.url,
          originalName: f.originalName,
          mimeType: f.mimeType,
          fileSize: f.fileSize,
          uploadedByName: f.uploadedByName,
          description: f.description,
          category: f.category,
          createdAt: f.createdAt,
        })),
        total: records.length,
      };
    }),

  /**
   * 获取文件预签名下载 URL
   */
  getUrl: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const file = await getFileById(input.id);
      if (!file) {
        throw new TRPCError({ code: "NOT_FOUND", message: "文件不存在" });
      }

      // 获取预签名 URL（有效期由 storageGet 决定）
      const { url } = await storageGet(file.fileKey);
      return { url, originalName: file.originalName, mimeType: file.mimeType };
    }),

  /**
   * 删除文件（仅删除数据库记录，S3 文件保留以防误删）
   * 如需同时删除 S3 文件，可在此扩展
   */
  delete: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const file = await getFileById(input.id);
      if (!file) {
        throw new TRPCError({ code: "NOT_FOUND", message: "文件不存在" });
      }

      // 权限校验：只有上传者或管理员可以删除
      const user = ctx.user;
      if (file.uploadedBy !== null && user?.id !== file.uploadedBy && user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权删除此文件" });
      }

      await deleteFile(input.id);
      return { success: true };
    }),

  /**
   * 更新文件元数据（描述、分类）
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        description: z.string().max(500).nullable().optional(),
        category: z.string().max(64).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const file = await getFileById(input.id);
      if (!file) {
        throw new TRPCError({ code: "NOT_FOUND", message: "文件不存在" });
      }

      const user = ctx.user;
      if (file.uploadedBy !== null && user?.id !== file.uploadedBy && user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权修改此文件" });
      }

      const patch: { description?: string | null; category?: string } = {};
      if (input.description !== undefined) patch.description = input.description;
      if (input.category !== undefined) patch.category = input.category;

      await updateFileMetadata(input.id, patch);
      return { success: true };
    }),
});
