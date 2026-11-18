# Moonetix 广告墙接入

> 服务商：[Moonetix](https://moonetix.com)（offerwall 联盟，不是问卷商）。
> 文档：<https://docs.moonetix.com>，给 AI 代理看的入口是 `/llms.txt`。
> 代码位置：`functions/api/[[path]].js` 里搜 `mtx` 前缀，前端在 `pages/earn.html`、`js/earn.js`。

## 现在的状态

没配密钥，走的是**站内模拟墙**（`/mock-wall`），用来把链路跑通：
生成链接 → 用户在墙里完成任务 → 服务端回调 → 校验 → 入账 → 记流水。

配齐下面三个环境变量后，`/earn` 自动切到真实广告墙，模拟墙同时停用，不需要改代码。

## 注册后要做的三件事

1. 在 Moonetix 后台创建 Offerwall（app），拿到 **App ID**。
2. 在 Integration 区拿 **Link hash salt**，在 Postback 页拿 **Postback secret key**。
3. 在 Cloudflare Pages 项目 `chengfa` 的 Settings → Environment variables 里加：

| 变量名 | 值 | 用途 |
| --- | --- | --- |
| `MOONETIX_APP_ID` | 24 位小写 hex | 拼广告墙链接 |
| `MOONETIX_LINK_SALT` | Integration 区的 Link hash salt | 给 `user_id` 做 HMAC-SHA256 签名 |
| `MOONETIX_POSTBACK_KEY` | Postback 页的 secret key | 校验每条回调 |

> 改环境变量必须**读全 → 改 → 带全所有变量和机密写回**。漏过一次，全站 500。

## Postback URL 填什么

```
https://chengfa-761.pages.dev/api/moonetix/postback
```

自定义域名上线后换成自己的域名。这个地址 GET / POST 都收，返回纯文本 `ok`（HTTP 200）。

## 奖励怎么算

服务商回调里的 `{reward}` **已经是本地货币数值**，不要再乘汇率。我们按 `reward × 10000` 转成整数单位
（和站内 `fc_units` 一致），直接加余额，并写一条 `fc_ledger`（kind `moonetix_reward`）。

服务商侧的换算建议：Conversion rate 设 `10000`（1 美元 = 10000 单位 = 1 CFB 的 1/1），
Split 按你想给用户的比例，Rounding 选「最多 3 位小数」。

## 幂等与冲正

- `transaction_id` 在 `mo_task` 表有唯一索引：同一条回调打十次也只入一次账。
- `status=1` 入账，`status=2` 冲正（扣回原面额，余额不够就扣到 0，流水里注明实际扣除额）。
- 两种都是先查原单，找不到 `status=2` 的直接回 `ok`，避免对方无限重试。

## 接入后必须核对的一件事

**签名串的拼法**是按常见约定写的（除签名字段外所有参数按名字升序拼 `k=v&k=v`，用
`MOONETIX_POSTBACK_KEY` 做 HMAC-SHA256，小写 hex）。正式接入时打开
<https://docs.moonetix.com/postbacks> 对一眼，如果官方拼法不同，只改一个函数：

```
mtxSignatureOk()   // functions/api/[[path]].js
```

改完用后台 Integration 页的 **Send a test postback** 打一条，看线上返回是不是 `ok`。

## 测试与排查

- 未接入时：`/earn` 显示「模拟墙」，只有站长/管理员能点「标记完成」，普通账户点了会提示无权限（防止刷积分）。
- 接入后：`/earn` 显示「已接入」，按钮打开 `wall.moonetix.com` 的新标签页。
- 线上要看服务端日志：Cloudflare Pages → 项目 → Functions → 实时日志，搜 `mtx postback`。
  签名不通过时会打一行「signature mismatch」+ 收到的参数名（只有键名，不含用户数据）。
