# 纸飞机小测 / Paper Quiz AI

把课程 PDF 或讲课录音变成一套可练习的小测。上传 PDF 后服务端调用 OpenAI 生成题目与解析；上传录音则先转写，用户确认或修改 transcript 后再生成题目。答题记录、错题本和练习进度只保存在当前浏览器的 localStorage 里。

线上站点：<https://paper-quiz-ai-amber.vercel.app/>

## 本地运行

```powershell
npm install
Copy-Item .env.example .env.local
# 在 .env.local 中填入 OpenAI Platform API Key
npm run dev
```

打开 `http://localhost:3000`。

`.env.local`：

```env
OPENAI_API_KEY=你的_OpenAI_Platform_API_Key
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-5.6-luna
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
BLOB_READ_WRITE_TOKEN=你的_Vercel_Blob_Token
```

Codex 的 ChatGPT 登录态不能直接作为网站后端 API Key。需要在 OpenAI Platform 创建可用的 API Key，并且不要把它写进前端代码、提交到仓库或发给别人。

`OPENAI_BASE_URL` 可选：填写兼容 OpenAI API 的网关地址（例如 `https://your-gateway.example/v1`），留空时使用官方地址。该变量只在服务端读取。若网关不代理 `/v1/files`，PDF 会自动回退为按请求内联发送（见下方「PDF 只上传一次」）。

## 当前能力

- 单个 PDF，或 MP3、M4A、WAV、WebM、MP4 讲课录音；支持拖拽上传。大文件直接上传到 Vercel Blob，不经过 Function 请求体
- 录音先转写，用户确认或修改 transcript 后再生成题目
- 四种题型可分别指定数量（合计上限 15 题）：选择题、填空题、简答题，以及自定义题型（可填写名称与出题要求）
- 三档难度：基础回顾 / 综合练习 / 挑战模式
- 一页一题。选择题与填空题在浏览器本地判分；简答题与自定义题由服务端结合原始材料评分，返回得分、反馈与缺失要点
- 每题可就该题追问，回答被约束在所给材料范围内
- 错题本：按题型筛选、批量选择、再次练习、导出 PDF、清空
- 进度页：正确率趋势、练习日历、导出进度 PDF
- 可从上传页恢复此前未做完的练习（"Resume a practice set"）
- PDF 导出分两版：学生版（不含答案）与答案版
- 题目、选项、解析统一用英文输出，即使材料是其他语言

## 数据与隐私

- API Key 只在服务端读取，客户端不接触
- 答题记录、错题本、进度都存在浏览器 localStorage，站点自身不保存
- 大文件会先直接上传到 Vercel Blob，服务端读取后立即删除临时 Blob；不会受到 Vercel Function 请求体大小限制
- 上传的材料会发送给 OpenAI 用于生成题目。**PDF 会存放在 OpenAI 侧最多 7 天**（`expires_after`），以便后续评分和追问引用同一份文件，到期自动删除
- 录音转写完成后会删除临时 Blob；transcript 若不超过 20000 字符会随会话存进 localStorage，以便刷新后仍能评分

## PDF 只上传一次

评分和追问都需要原始材料。早期实现每次调用都把 PDF 重新 base64 内联发送，同一份 PDF 在一套简答题加若干轮追问里会被重复传输十几次，这是成本和延迟的主要来源。

现在 `POST /api/generate-quiz` 通过 Files API 上传一次，返回 `sourceFileId`；`/api/grade-answer` 与 `/api/question-chat` 只传这个 id，用 `input_file.file_id` 引用。id 会随会话与错题条目一起持久化，所以刷新页面后简答题仍然可以评分。

若 Files API 不可用（例如自定义网关未代理该端点），会回退为内联发送，此时 `sourceFileId` 为 `null`，行为与旧版一致。

## 请求上限

项目不再设置文件大小或 API 调用次数额度。文件仍需符合 PDF、MP3、M4A、WAV、WebM 或 MP4 类型；OpenAI 或 Vercel Blob 自身的服务上限仍然适用。文本字段保留防止异常请求的边界：transcript 120000 字符、答案 12000 字符、追问 2000 字符、对话历史 8 条。

API 路由声明 `maxDuration = 60`；前端用同样的 60 秒 AbortController，超时会明确提示是超时而不是笼统的失败。

## 验证命令

```powershell
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

如果还没有配置 API Key，页面仍然可以打开和检查上传界面；点击生成时会提示服务端尚未配置 API Key。

## 部署

线上部署在 Vercel。先在项目的 Storage 页面创建并连接一个 Blob store，使 Vercel 自动注入 `BLOB_READ_WRITE_TOKEN`；再在 `Settings → Environment Variables` 中配置 `OPENAI_API_KEY`。不要把任何服务端 token 写成 `NEXT_PUBLIC_*`。

仓库同时保留了 `netlify.toml` 与 `@netlify/plugin-nextjs`，可在 Netlify 部署；环境变量填在 `Project configuration → Environment variables`。
