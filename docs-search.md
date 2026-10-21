# DSH 官方搜索链路

## 结论

DSH 0.2.1-rc.2 **自带**官方搜索，不需要第三方插件：

```yaml
- id: web
  config:
    searchProvider: deepseek-official   # 默认就是它
    fetchProvider: http
- id: web-search-deepseek
  name: '@deepseek-ai/dsh-web-search-deepseek'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
```

包描述：`DeepSeek-backed search provider (native web_search via the
Anthropic-compatible API)`。默认端点 `https://api.deepseek.com/anthropic/v1`。

## 为什么现在不能用

缺 `DEEPSEEK_API_KEY`。`~/.dsh/dsh-web.env` 里只有 `XUEXIAO_API_KEY`。

西湖 HPC 隧道（`127.0.0.1:18317`）是 **OpenAI 兼容**端点，
`/anthropic/v1/messages` 只是网关的 SPA 兜底页（返回 HTML），
所以官方搜索**不能**指向西湖。

## 怎么开

在 `~/.dsh/dsh-web.env` 里加一行，然后重启：

```bash
echo 'DEEPSEEK_API_KEY=sk-你的key' >> ~/.dsh/dsh-web.env
systemctl --user restart dsh-web
```

重启后约 40 秒就绪，用 `dsh-open` 打开即可。

## 顺手清理的

两个旧版遗留变量（searxng 插件时代），已删除：

- `WEB_SEARCH_PROVIDER` —— 当前版本读的是 `DSH_WEB_SEARCH_PROVIDER`，这个没人读
- `SEARXNG_URL` —— 插件已卸载

备份在 `~/.dsh/dsh-web.env.bak-<时间戳>`。
