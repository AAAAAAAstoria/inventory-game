/**
 * files.test.ts — 文件存储路由单元测试
 *
 * 测试 files.upload / files.list / files.getUrl / files.delete / files.update
 * 使用 mock 替代真实 DB 和 S3 调用
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────

// NOTE: vi.mock is hoisted, so factory must not reference top-level variables.
// Define the mock record inline inside the factory.
vi.mock("./db", () => {
  const record = {
    id: 1,
    fileKey: "inventory-game/files/abc123.pdf",
    url: "https://cdn.example.com/inventory-game/files/abc123.pdf",
    originalName: "test-report.pdf",
    mimeType: "application/pdf",
    fileSize: 102400,
    uploadedBy: 1,
    uploadedByName: "Test User",
    description: "测试报告",
    category: "report",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
  return {
    insertFile: vi.fn().mockResolvedValue(undefined),
    listFiles: vi.fn().mockResolvedValue([record]),
    getFileById: vi.fn().mockImplementation((id: number) =>
      id === 1 ? Promise.resolve(record) : Promise.resolve(null)
    ),
    getFileByKey: vi.fn().mockResolvedValue(record),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    updateFileMetadata: vi.fn().mockResolvedValue(undefined),
    // keep user helpers
    upsertUser: vi.fn(),
    getUserByOpenId: vi.fn(),
    getDb: vi.fn(),
  };
});

// Used in tests directly
const mockFileRecord = {
  id: 1,
  fileKey: "inventory-game/files/abc123.pdf",
  url: "https://cdn.example.com/inventory-game/files/abc123.pdf",
  originalName: "test-report.pdf",
  mimeType: "application/pdf",
  fileSize: 102400,
  uploadedBy: 1,
  uploadedByName: "Test User",
  description: "测试报告",
  category: "report",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    key: "inventory-game/files/abc123.pdf",
    url: "https://cdn.example.com/inventory-game/files/abc123.pdf",
  }),
  storageGet: vi.fn().mockResolvedValue({
    key: "inventory-game/files/abc123.pdf",
    url: "https://cdn.example.com/inventory-game/files/abc123.pdf?signed=1",
  }),
}));

// ─── Context helpers ──────────────────────────────────────────

function makeCtx(overrides?: Partial<TrpcContext>): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      name: "Test User",
      email: "test@example.com",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    ...overrides,
  };
}

function makeAnonymousCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe("files.upload", () => {
  it("成功上传 PDF 文件", async () => {
    const caller = appRouter.createCaller(makeCtx());
    // 生成一个最小有效的 base64 PDF
    const base64Content = Buffer.from("%PDF-1.4 test content").toString("base64");

    const result = await caller.files.upload({
      originalName: "test-report.pdf",
      mimeType: "application/pdf",
      base64Content,
      fileSize: 21,
      description: "测试报告",
      category: "report",
    });

    expect(result.success).toBe(true);
    expect(result.originalName).toBe("test-report.pdf");
    expect(result.url).toContain("cdn.example.com");
  });

  it("拒绝不支持的 MIME 类型", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const base64Content = Buffer.from("test").toString("base64");

    await expect(
      caller.files.upload({
        originalName: "malware.exe",
        mimeType: "application/x-msdownload",
        base64Content,
        fileSize: 4,
      })
    ).rejects.toThrow("不支持的文件类型");
  });

  it("拒绝超过 50MB 的文件", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const base64Content = Buffer.from("small").toString("base64");

    await expect(
      caller.files.upload({
        originalName: "huge.zip",
        mimeType: "application/zip",
        base64Content,
        fileSize: 60 * 1024 * 1024, // 60MB
      })
    ).rejects.toThrow("文件过大");
  });

  it("匿名用户也可上传", async () => {
    const caller = appRouter.createCaller(makeAnonymousCtx());
    const base64Content = Buffer.from("test csv content").toString("base64");

    const result = await caller.files.upload({
      originalName: "data.csv",
      mimeType: "text/csv",
      base64Content,
      fileSize: 16,
    });

    expect(result.success).toBe(true);
  });
});

describe("files.list", () => {
  it("返回文件列表", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.files.list({ limit: 50, offset: 0 });

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.originalName).toBe("test-report.pdf");
    expect(result.files[0]?.mimeType).toBe("application/pdf");
    expect(result.files[0]?.fileSize).toBe(102400);
  });

  it("使用默认参数", async () => {
    const caller = appRouter.createCaller(makeAnonymousCtx());
    const result = await caller.files.list();
    expect(Array.isArray(result.files)).toBe(true);
  });
});

describe("files.getUrl", () => {
  it("返回预签名下载 URL", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.files.getUrl({ id: 1 });

    expect(result.url).toContain("signed=1");
    expect(result.originalName).toBe("test-report.pdf");
    expect(result.mimeType).toBe("application/pdf");
  });

  it("文件不存在时抛出 NOT_FOUND", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.files.getUrl({ id: 999 })).rejects.toThrow("文件不存在");
  });
});

describe("files.delete", () => {
  it("文件上传者可以删除自己的文件", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.files.delete({ id: 1 });
    expect(result.success).toBe(true);
  });

  it("文件不存在时抛出 NOT_FOUND", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.files.delete({ id: 999 })).rejects.toThrow("文件不存在");
  });

  it("管理员可以删除任何文件", async () => {
    const adminCtx = makeCtx({
      user: {
        id: 99,
        openId: "admin-user",
        name: "Admin",
        email: "admin@example.com",
        loginMethod: "manus",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
    });
    const caller = appRouter.createCaller(adminCtx);
    const result = await caller.files.delete({ id: 1 });
    expect(result.success).toBe(true);
  });
});

describe("files.update", () => {
  it("更新文件描述和分类", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.files.update({
      id: 1,
      description: "更新后的描述",
      category: "data",
    });
    expect(result.success).toBe(true);
  });

  it("文件不存在时抛出 NOT_FOUND", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.files.update({ id: 999, description: "test" })
    ).rejects.toThrow("文件不存在");
  });
});
