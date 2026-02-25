# inventory-game TODO

## 核心游戏功能
- [x] 游戏核心逻辑（降维决策、SKU计算引擎、C1-C5约束）
- [x] 前端界面（深色工业仪表盘风格）
- [x] 持货成本 C_hold 和安全库存约束 C2
- [x] 参考建议量（贪心算法，含库存上限截断）

## 全栈升级
- [x] 升级为全栈（web-db-user：Express + tRPC + MySQL）
- [x] 解决 Home.tsx 升级冲突（保留游戏代码）
- [x] 数据库 schema：files 表（存储文件元数据）
- [x] 运行 pnpm db:push 同步数据库

## 文件存储功能
- [x] 后端 tRPC 路由：文件上传/列表/下载/删除/更新（server/routers/files.ts）
- [x] server/db.ts 扩展（insertFile / listFiles / getFileById / deleteFile / updateFileMetadata）
- [x] 前端文件库页面（/files）：拖拽上传、列表、下载、删除、分类筛选
- [x] App.tsx 注册 /files 路由
- [x] GameHUD 新增文件库导航入口
- [x] vitest 单元测试（14 个测试全部通过）
