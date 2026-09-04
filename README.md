# TikTok Viral Breakdown Skill

把视频链接、口播和数据截图，变成一份**有证据、能复用的短视频结构拆解**。

基于 [guimatheus92/mcp-video-analyzer](https://github.com/guimatheus92/mcp-video-analyzer) 的素材提取能力，补上电商内容分析方法、中文报告格式和证据校验。支持美妆，也可用于其他电商品类。

> 这是 **AI Skill + 命令行辅助工具**，不是独立网页。需要能读取Skill和图片的AI客户端。命令行负责提取/整理/校验/排版，营销判断由你的AI客户端完成；不内置付费模型调用，不保证任何TikTok链接都可访问。

## 朋友如何使用

### 1. 安装Skill

在支持Agent Skills的环境中：

```sh
npx skills add Avery0411/tiktok-viral-breakdown-skill --skill tiktok-viral-breakdown
```

按安装器选择客户端。或者下载本仓库，把 `skills/tiktok-viral-breakdown` 文件夹放进客户端指定的skills目录，再重新加载客户端。Skill文件本身不自动安装视频引擎。

### 2. 提供材料，直接提问

```text
使用 $tiktok-viral-breakdown 拆解这个TikTok视频：[链接]
完整模式，精确到原话；基础信息列举，脚本用时间轴表格。
```

```text
使用 $tiktok-viral-breakdown，轻量模式。
这是链接、带时间戳脚本和互动截图。复用已有材料，不重复转写。
```

```text
使用 $tiktok-viral-breakdown 拆这个无口播展示视频。
重点看首帧、实际动作、效果和节奏，不编口播或未看到的镜头。
```

**如果只有脚本和截图，无需安装视频引擎，也能先做有边界的口播分析。**如果要“只发链接自动看画面”，继续配置引擎。

### 3. 配置视频引擎（二选一）

**MCP方式：**在你的MCP客户端注册一个stdio服务器：

```json
{
  "mcpServers": {
    "video-analyzer": {
      "command": "npx",
      "args": ["-y", "mcp-video-analyzer@0.10.0"]
    }
  }
}
```

不同客户端配置入口/外层字段可能不同，以上为通用示意。Windows客户端如不能直接调用npx，请按客户端说明配置实际可执行文件。前置条件：Node.js 22.12+；处理TikTok等平台通常还需要 `yt-dlp` 在PATH内。无字幕的有声视频需另行配置上游支持的转写后端。

**CLI方式：**下载本仓库后：

```sh
git clone https://github.com/Avery0411/tiktok-viral-breakdown-skill.git
cd tiktok-viral-breakdown-skill
npm install
node skills/tiktok-viral-breakdown/scripts/cli.mjs prepare --source "视频链接或本地视频路径" --mode standard --out runs/video-1
```

然后让AI读取 `runs/video-1/evidence.json`、实际查看帧，并按Skill生成报告；分析JSON由AI填写，你无需手写。安装Skill目录与克隆仓库是两件事；辅助脚本在克隆仓库中运行，或通过 `--engine` 指向已安装上游的dist/index.js。

## 工作链路

```text
链接 / 本地文件 / 现成脚本 + 数据截图
                 ↓
mcp-video-analyzer：转写 / 关键帧 / OCR / 基础信息
                 ↓
证据包：时间戳、来源、缺失项、完整原文
                 ↓
AI查看画面 + 对齐原话 → Hook / 痛点 / 信任 / 节奏 / CTA
                 ↓
校验 → 基础信息 + 脚本表格 + 核心爆点 + 可迁移公式
```

### 三种模式

| 模式 | 做什么 | 不做什么 |
|---|---|---|
| 完整 | 整体理解、完整转写、关键帧与局部动作核对 | 不把抽帧称为逐帧观看 |
| 轻量 | 复用脚本/截图，合并重复段落，减少采样 | 不截掉关键原话，不猜画面 |
| 纯展示 | 看实际动作、首帧、妆效、字幕、节奏 | 不造口播，不把无口播当静音 |

CLI中的light减少初始帧数，不使用会截断转写的brief。showcase优先走MCP的get_frames；CLI回退仍可能触发上游转写。多视频应逐条独立处理；本仓库CLI单次处理一条，批量由上游MCP analyze_videos或客户端调度完成。

## 无需联网的试跑

不安装任何npm依赖也能运行以下示例（只需要Node）：

```sh
node skills/tiktok-viral-breakdown/scripts/cli.mjs prepare --input examples/raw.json --metrics examples/metrics.json --out runs/demo
node skills/tiktok-viral-breakdown/scripts/cli.mjs render --bundle runs/demo/evidence.json --analysis examples/analysis.json --out runs/demo/report.md
node --test tests/*.test.mjs
```

打开 `runs/demo/report.md` 查看报告，也可以直接看 [示例成品](examples/report.md)。示例材料全部合成，不包含真人视频、客户数据或真实分析结论。重复运行请换新目录，工具不覆盖旧结果。

## 你会拿到什么

1. 基础信息：品牌、产品、账号、时间、时长、播放/互动数据与来源。
2. 脚本表格：时间｜做了什么/原话/中文翻译｜内容作用。
3. Hook：具体内容、位置与停留动机。
4. 用户痛点、视听协同、信任证据链。
5. 核心转折和爆点结构、可迁移公式。
6. 未核实项：不访问成功也不假装看过。

完整格式见 [报告规范](skills/tiktok-viral-breakdown/references/report-format.md)，方法见 [分析方法](skills/tiktok-viral-breakdown/references/workflow.md)。

## 自动检查与边界

- 互动率=(点赞+评论+分享)/播放量；含收藏版本另算。缺任何必要项或播放为0都不计算。
- 数据截图与上游有冲突时不静默拼接；输入完整快照来源和观察时间。
- 口播引用必须匹配证据原文；这只检查转写一致性，不保证ASR本身准确。
- 镜头动作需要画面引用及明确的已查看标记；自动校验无法证明AI真的看过或理解正确。
- 拒绝越界、倒序、重叠时间段和无依据的画面引用。
- “无剪辑”“7天不掉”“100%防水”需区分自述和实际测试；没有留存/订单数据不确定爆款归因。
- 品牌识别和营销逻辑仍须AI/人工审核，工具不保证绝对正确。

## 隐私、费用与失败处理

本Skill本身不读取Cookie或上传视频，不增加遥测；但上游会访问视频平台，配置云转写时可能发送音频并产生费用。使用前核对上游环境配置与服务条款。不要把 `.env`、Cookie、API Key、原视频或客户素材提交到GitHub。

抓取失败保留warnings；不要无限重试或绕过验证。可以上传自己有权处理的视频文件，或改用脚本/截图。失败的输出目录保留供诊断，下次使用新目录。

## 版本与贡献

当前依赖固定为 `mcp-video-analyzer@0.10.0`。升级前验证CLI JSON格式与抽帧行为。测试使用Node自带test runner；附有GitHub Actions配置用于Linux和Windows离线测试，不接触个人视频。已完成的验证与边界见 [TESTING.md](TESTING.md)。欢迎提交匿名、合成的回归用例，不提交第三方凭据或未授权素材。

## 致谢与许可证

上游作者 [guimatheus92](https://github.com/guimatheus92) 提供视频解析引擎。本项目是独立扩展，不是其官方产品，也不与TikTok官方关联。代码与Skill采用MIT；视频、商标和第三方素材仍归各自权利人。详见 [LICENSE](LICENSE) 和 [THIRD_PARTY.md](THIRD_PARTY.md)。
