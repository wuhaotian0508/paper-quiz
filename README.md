# 纸飞机小测

一个把课程 PDF 或讲课录音变成选择题的轻量复习网站。上传 PDF 后，服务端调用 OpenAI 生成题目、四个选项、正确答案和解析；上传录音后，服务端先转写，用户可以修改 transcript，再生成题目。答题状态只保存在当前页面。

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
OPENAI_MODEL=gpt-5.6
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

Codex 的 ChatGPT 登录态不能直接作为网站后端 API Key。需要在 OpenAI Platform 创建可用的 API Key，并且不要把它写进前端代码、提交到仓库或发给别人。

## 当前能力

- 支持单个 PDF 或 MP3、M4A、WAV、WebM、MP4 讲课录音，最大 20MB
- 录音先转写，用户确认或修改 transcript 后再生成题目
- 可选 5、10、15 题
- 可选基础回顾、综合练习、挑战模式
- 一页一题，提交后显示答案和解析
- 最终显示得分和错题回顾
- 服务端校验文件与设置，客户端不接触 API Key

## 验证命令

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

如果还没有配置 API Key，页面仍然可以打开和检查上传界面；点击生成时会提示服务端尚未配置 API Key。

## 部署到 Netlify

在 Netlify 站点的 `Project configuration → Environment variables` 中添加：

```env
OPENAI_API_KEY=你的_OpenAI_Platform_API_Key
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-5.6
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

部署命令已经写入 `netlify.toml`，Next.js API 路由会由 Netlify 的 Next.js 插件转换为服务端函数。不要把 `OPENAI_API_KEY` 写入 `NEXT_PUBLIC_*` 变量。

`OPENAI_BASE_URL` 可选：填写兼容 OpenAI API 的网关地址（例如 `https://your-gateway.example/v1`）；留空时使用 OpenAI 官方默认地址。该变量同样只在服务端读取。
