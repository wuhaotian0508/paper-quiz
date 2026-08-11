# Repository Guidelines

## 项目结构与模块职责

这是一个 Next.js 15 + React 19 + TypeScript 应用。页面、路由和 API 端点位于 `app/`，例如 `app/api/generate-quiz/route.ts`；可复用界面组件位于 `components/`；领域逻辑、OpenAI/Supabase 客户端及数据转换位于 `lib/`。`hooks/` 放置 React hooks，`public/` 存放静态资源，`supabase/migrations/` 保存数据库迁移及迁移测试，`docs/` 保存设计说明。优先把业务规则放进 `lib/`，让组件和路由保持编排职责。

## 开发、构建与检查

安装依赖后复制环境模板：`npm install`、`Copy-Item .env.example .env.local`。使用 `npm run dev` 在 `http://localhost:3000` 启动开发服务器；`npm run build` 创建生产构建，`npm run start` 运行构建产物。

提交前运行以下检查：

```powershell
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

`npm run format` 会直接重写文件，只在确认格式变更属于本次工作时使用。

## 代码风格与命名

使用严格 TypeScript，避免 `any`，通过 `@/` 导入仓库根目录模块。Prettier 规定双引号、分号、尾随逗号和 100 列宽；ESLint 使用 Next.js Core Web Vitals 规则。组件文件和导出组件用 kebab-case 文件名与 PascalCase 名称，例如 `components/review-sheet-view.tsx` / `ReviewSheetView`；工具模块用 kebab-case，例如 `lib/review-schedule.ts`。保持现有中文、英文文案均同步更新 `lib/i18n-zh.ts` 与 `lib/i18n-en.ts`。

## 测试要求

测试采用 Vitest、Testing Library 与 jsdom，测试文件与被测模块同目录，命名为 `*.test.ts` 或 `*.test.tsx`。新增逻辑至少覆盖正常流程和关键错误/边界情况；修改 API、组件或迁移时，补充对应测试。项目未配置硬性覆盖率阈值，但不得以删减测试规避失败。

## 提交、PR 与安全

近期历史采用 Conventional Commit 风格：`feat: add review schedule`、`fix: handle expired session`、`refactor: simplify sync state`。每个提交聚焦一个可审查改动。PR 应说明用户影响、测试命令结果、关联 issue；涉及界面请附截图，涉及迁移请说明迁移顺序与回滚考虑。

不要提交 `.env.local`、OpenAI、Stripe、Supabase 或 Vercel Blob 密钥，也不要将服务端密钥命名为 `NEXT_PUBLIC_*`。修改 `supabase/migrations/` 时优先新增不可变迁移，勿改写已共享的迁移文件。
