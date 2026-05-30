# @weiseer/api-changelog-mcp

> SDK breaking-change tracker as a stdio MCP server.

Probe **P-004** by [weiseer](https://github.com/weiseer).

## What it does

Tracks latest version + breaking changes for SDKs AI agents depend on (Anthropic, OpenAI, Google GenAI, MCP SDK, LangChain, LlamaIndex, Mistral, Cohere, Vercel AI, Next.js, React, HuggingFace, Replicate, Ollama).

Your agent can:
- `list_tracked` — packages we track + latest version + 30d breaking-change count
- `get_package` — full record with recent breaking events + GitHub release URL
- `get_recent_breaking` — breaking changes across all packages, filterable
- `check_version` — "I'm on v X — am I behind, and what breaks if I upgrade?"

## Why use this instead of your agent scraping GitHub releases

| | Agent DIY | api-changelog |
|---|---|---|
| Releases to fetch | 18 GitHub repo release feeds | 1 MCP call |
| Token cost | $0.06-0.20 | $0 free / $0.00005 paid |
| Latency | 5-15 seconds | <100ms |
| Breaking-change classification | LLM-classified per call | Pre-classified once |

## Install

```bash
npm install -g @weiseer/api-changelog-mcp
```

## Use with Claude Desktop / Cursor / Cline / Continue / Windsurf

```json
{
  "mcpServers": {
    "api-changelog": {
      "command": "npx",
      "args": ["-y", "@weiseer/api-changelog-mcp"]
    }
  }
}
```

## License

Apache-2.0
