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

**必须带宏**，只填路径的话后端收不到任何参数：

```
https://chengfa-761.pages.dev/api/moonetix/postback?user={user_id}&tx={transaction_id}&event={event_id}&status={status}&reward={reward}&payout={payout}&hash={hash}
```

宏名照官方的来：用户是 `user`、交易号是 `tx`（后端两种写法都认，但官方只发这一套）。
自定义域名上线后把前半段换掉。GET / POST 都收，返回纯文本 `ok`（HTTP 200），
**6 秒内必须响应**（我们是毫秒级）。

## 奖励怎么算

服务商回调里的 `{reward}` **已经是本地货币数值**，不要再乘汇率。我们按 `reward × 10000` 转成整数单位
（和站内 `fc_units` 一致），直接加余额，并写一条 `fc_ledger`（kind `moonetix_reward`）。

服务商侧的换算建议：Conversion rate 设 `10000`（1 美元 = 10000 单位 = 1 CFB 的 1/1），
Split 按你想给用户的比例，Rounding 选「最多 3 位小数」。

## 幂等与冲正

- `transaction_id` 在 `mo_task` 表有唯一索引：同一条回调打十次也只入一次账。
- `status=1` 入账，`status=2` 冲正（扣回当初入账的原面额；余额不够就扣成负数，流水里写明）。
- 未知单号的 `status=2` 记一条 `unknown-reversal` 占位，防止迟到的入账再发钱。

## 签名（已按官方开源实现核对过）

官方在 <https://github.com/moonetix/offerwall-postback-handlers> 放了 PHP / Node / Python / Java
四份 handler 和 20 个测试用例。签名串就是这一行，没有别的花样：

```
hash = hex( HMAC-SHA256( key = postback secret key,
                         message = tx + ":" + user + ":" + reward + ":" + status ) )
```

- 只有这四个值参与，用冒号连接；`payout` / `event` / `offer_id` / `offer_name` **不签**
- `reward` 必须用收到的原串，`150` 和 `150.00` 算出来的哈希不同 —— 不要格式化、不要四舍五入
- 小写 hex、64 位；缺 hash 回 400，签名不对回 403
- 用的是 **postback secret key**，不是 link hash salt

之前猜的「所有参数按名字升序拼 k=v」是错的，已改成上面的写法（`mtxSignatureOk`）。

**冲正语义也照官方**：`status=2` 扣回的是**当初入账的那笔金额**（不是回调里带的 reward）；
余额不够就扣成负数；收到从没入过账的 `status=2` 会记一条 `unknown-reversal` 占位，
之后迟到的 `status=1` 查到这个占位就不再发钱。

自测用官方工具，它按官方规则生成带签名的回调，连篡改和并发重复一起测：

```
npx github:moonetix/postback-tester --preset moonetix \
  'https://chengfa-761.pages.dev/api/moonetix/postback?user={user_id}&tx={transaction_id}&event={event_id}&status={status}&reward={reward}&payout={payout}&hash={hash}' --user 1
```

## 测试与排查

- 未接入时：`/earn` 显示「模拟墙」，只有站长/管理员能点「标记完成」，普通账户点了会提示无权限（防止刷积分）。
- 接入后：`/earn` 显示「已接入」，按钮打开 `wall.moonetix.com` 的新标签页。
- 线上要看服务端日志：Cloudflare Pages → 项目 → Functions → 实时日志，搜 `mtx postback`。
  签名不通过时会打一行「signature mismatch」+ 收到的参数名（只有键名，不含用户数据）。
