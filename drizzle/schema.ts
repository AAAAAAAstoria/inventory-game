import { bigint, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * files 表：存储 S3 文件元数据
 * 实际文件字节存储在 S3，此表仅保存引用信息
 */
export const files = mysqlTable("files", {
  id: int("id").autoincrement().primaryKey(),
  /** S3 文件键（路径），用于 storagePut/storageGet */
  fileKey: varchar("fileKey", { length: 512 }).notNull().unique(),
  /** S3 公开访问 URL */
  url: text("url").notNull(),
  /** 原始文件名（用户上传时的文件名） */
  originalName: varchar("originalName", { length: 255 }).notNull(),
  /** MIME 类型，如 application/pdf, image/png */
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  /** 文件大小（字节） */
  fileSize: bigint("fileSize", { mode: "number" }).notNull(),
  /** 上传者用户 ID（关联 users.id），null 表示匿名上传 */
  uploadedBy: int("uploadedBy"),
  /** 上传者名称（冗余存储，避免 JOIN） */
  uploadedByName: varchar("uploadedByName", { length: 128 }),
  /** 文件描述（可选） */
  description: text("description"),
  /** 文件分类标签，如 "game-result", "report", "data" */
  category: varchar("category", { length: 64 }).default("general"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FileRecord = typeof files.$inferSelect;
export type InsertFileRecord = typeof files.$inferInsert;
