# 素材提取与文件工具

上游：https://github.com/guimatheus92/mcp-video-analyzer 。本仓库依赖0.10.0，不复制上游代码。读取已连接工具的真实schema，不猜参数。

## MCP优先

- 完整：analyze_video，standard；核对warnings、转写、实际帧文件。
- 已有脚本：get_frames + get_metadata，避免重复ASR。
- 无口播：get_frames + get_metadata。纯展示仍可能含音乐，不能推断静音。
- 关键动作：analyze_moment / get_frame_burst；若有已提供脚本，优先仅取帧。
- 多视频：analyze_videos，每条独立检查结果；一次失败不终止其他条。

brief可能只有前10条转写且没有帧；fields仅过滤返回字段，不保证跳过下载/转写。TikTok互动字段不一定齐全；缺失用用户截图或页面补，评论正文不保证支持。

## 无MCP的CLI

仓库根目录npm install后，运行：

```sh
node skills/tiktok-viral-breakdown/scripts/cli.mjs prepare --source "https://www.tiktok.com/@ACCOUNT/video/ID" --mode standard --out runs/video-1
```

输出evidence.json，不是营销报告；AI需要实际看frames后分析。脚本不会自己调用AI或生成虚假的画面说明。首次运行可能下载视频/OCR资源，ASR费用和数据外传由上游配置决定；使用者自行确认云端服务。不要把Cookies/API密钥写进仓库。

可用 --engine 指向已安装的上游dist/index.js；--out必须是新目录，不覆盖历史结果。--mode light减少帧数但不截短转写。showcase在CLI回退中仍可能经过上游ASR，因此无口播优先MCP帧工具或导入已有JSON。

离线复用已有上游JSON或人工整理数据：

```sh
node skills/tiktok-viral-breakdown/scripts/cli.mjs prepare --input raw.json --metrics metrics.json --out runs/video-1
```

metrics.json格式：

```json
{"views":2400000,"likes":33300,"comments":386,"saves":11350,"shares":3031,"source":"用户截图","observedAt":"2026-09-04"}
```

只接受未缩写的非负整数/null，不自动猜3.3K的精度。提供外部metrics时整组使用该来源，不拿旧播放量混合新点赞数。证据包保留上游警告。

## 渲染报告

读取 [analysis-schema.md](analysis-schema.md)，由AI按该结构编写分析文件，用户无需手填JSON。segments里的quotes引用transcript:N，画面引用frame:N；确认自己实际看过对应图片，不能仅因有路径就填写动作。render做结构检查和原话子串检查，不代替人/模型语义审核。

```sh
node skills/tiktok-viral-breakdown/scripts/cli.mjs render --bundle runs/video-1/evidence.json --analysis analysis.json --out runs/video-1/report.md
```

没有画面时action留空；没有口播时quotes为空。字段ref精确引用证据ID，不猜时间。自动检查越界、缺证据的动作、错误引用、改写原话、缺失分析部分。对品牌确认程度需人工核实。
