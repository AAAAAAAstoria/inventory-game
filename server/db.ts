import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { files, InsertFileRecord, InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── File Storage Helpers ─────────────────────────────────────────────────────

/**
 * 插入文件元数据记录
 */
export async function insertFile(record: InsertFileRecord) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(files).values(record);
  return result;
}

/**
 * 列出所有文件，按创建时间倒序
 */
export async function listFiles(limit = 100, offset = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(files)
    .orderBy(desc(files.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * 按 ID 查询文件
 */
export async function getFileById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(files).where(eq(files.id, id)).limit(1);
  return result[0] ?? null;
}

/**
 * 按 fileKey 查询文件
 */
export async function getFileByKey(fileKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(files).where(eq(files.fileKey, fileKey)).limit(1);
  return result[0] ?? null;
}

/**
 * 删除文件元数据记录（S3 文件本身需要单独删除）
 */
export async function deleteFile(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(files).where(eq(files.id, id));
}

/**
 * 更新文件描述和分类
 */
export async function updateFileMetadata(
  id: number,
  patch: { description?: string | null; category?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(files).set(patch).where(eq(files.id, id));
}
