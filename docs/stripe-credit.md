# 预付余额（Stripe）

学习者可以在「设置」里预充值。练习本身仍然免费且不限量，充值只是为将来开始计费时预留额度——余额不会成为任何一道门槛。

## 钱是怎么变成余额的

1. `POST /api/checkout`：从服务端固定价目表取金额（请求体里的价格一律不采信），从会话 Cookie 取当前登录用户，创建 Stripe 托管收银台会话，并把用户 id 同时写进 `client_reference_id`、会话 `metadata` 和 charge 的 `metadata`。未登录返回 401——没有账户就没有地方记这笔钱。
2. 学习者在 Stripe 页面付款，被重定向回 `/?checkout=success`。**这一步不产生任何余额**：这只是一次浏览器跳转，谁都能手输，关掉标签页也会跳过。
3. `POST /api/stripe/webhook`：校验签名后，把 `checkout.session.completed`（以及延迟付款方式的 `checkout.session.async_payment_succeeded`）写成一条正数账目，把 `refund.created` 写成一条负数账目。这里是唯一会改变余额的地方。
4. `GET /api/credit`：把该用户的账目求和返回。余额永远是账本的和，不存成一个数字。

## 幂等

Stripe 至少投递一次，失败会重试。账本对 `stripe_event_id` 建了唯一索引，重复投递会撞唯一约束，被当成「已记录」直接返回 200。所以 webhook 出错时返回 500 让 Stripe 重试是安全的。

退款用 `refund.created` 而不是 `charge.refunded`：前者每条是一次独立增量，后者报的是累计已退金额，两次部分退款会把钱扣两遍。

## 需要的环境变量

| 变量                        | 用途                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`         | 建议用受限密钥（`rk_`），只开 Checkout Sessions 权限。留空 = 关闭充值功能。         |
| `STRIPE_WEBHOOK_SECRET`     | webhook 签名密钥。留空时 webhook 返回 503，绝不采信未验签的请求。                   |
| `SUPABASE_SERVICE_ROLE_KEY` | 仅 webhook 使用。绕过 RLS，是唯一能写入账本的凭据，**不可**加 `NEXT_PUBLIC_` 前缀。 |

账本表 `paper_quiz_credit_entries` 只给 `authenticated` 授了 `select`（且 RLS 限定本人），没有任何 insert 授权——浏览器直连 Supabase 也无法给自己充值。

## 接线

Dashboard → Webhooks 新建端点 `https://<域名>/api/stripe/webhook`，勾选这三个事件：

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `refund.created`

本地开发：

```powershell
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

把它打印的 `whsec_...` 填进 `.env.local` 的 `STRIPE_WEBHOOK_SECRET`。测试卡号 `4242 4242 4242 4242`，任意未来有效期与 CVC。

## 已知边界

- 余额目前只显示，不扣减——按 token 成本扣费需要先把 `lib/usage-meter.ts` 的计量从浏览器搬到服务端，那是另一件事。
- 争议（`charge.dispute.created`）未处理：金额少、暂时靠 Dashboard 人工看。
- 退款若找不到对应的充值记录，会记日志并跳过，而不是凭空记一笔负债——那笔充值既然没进过账本，余额也就没多过。
