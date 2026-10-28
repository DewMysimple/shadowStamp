# Postal Studies · 狮行万里

React、Vite 与原生 Three.js 构建的交互邮票展览。当前是三组、12枚醒狮地域邮票：广东篇4张竖版、中国篇4张横版、世界篇4张超长竖版。每张场景插画单独生成，保留明亮的地域建筑、街道、天空和节庆色彩；邮票编号、标题、齿孔与说明由代码排版。

[12张票面总览](artifacts/region-stamps/contact-sheet.png) · [桌面画廊](artifacts/region-stamps/overview.png) · [广东篇悬停暖光](artifacts/region-stamps/hover-foshan.png) · [独立票面PNG](artifacts/region-stamps/prints/) · [生成与设计记录](docs/region-stamps.md)

当前参数面板提供六种艺术命名的光影算法，包含旧版乘算与本工程新版局部加光，默认保留新版；另保留微细纸纹、聚焦、背景邮票虚化、键盘和触摸操作。详见[六种光影](docs/light-presets.md)。动态光图只采样于当前悬停/聚焦邮票；桌面背景保持静止，票面插画在未受光时保持原始RGB。纸面允许浅压纹，不做凸字浮雕、真实图案位移或金属化。

## 运行

需要 Node.js 22.12+（本机验证为24.16）。在本目录运行：

```powershell
npm install
npm run dev
```

打开终端显示的地址，默认 [http://127.0.0.1:4173/](http://127.0.0.1:4173/)。参数面板在桌面默认展开，小屏默认收起；通过顶部按钮可筛选“全部12张 / 广东篇 / 中国篇 / 世界篇”。

## 验证

```powershell
npm run build
npm test
# 保持开发服务启动，再开一个终端：
npm run test:stamps
npm run test:browser
npm run test:rapid-hover
```

浏览器脚本使用本机 Chrome 与 Playwright，不要求额外下载浏览器。可通过 `VERIFY_URL` 指定已有开发服务。最新地域邮票的截图、SHA、图稿解码和浏览器报告保存在 `artifacts/region-stamps/`。旧“醒狮八态”报告保留为历史记录，不代表当前12张内容。

## 代码入口

| 文件 | 职责 |
| --- | --- |
| `src/config.js` | 三组与12枚邮票元数据、比例、序号和分组布局 |
| `src/artwork.js` | 解码本地插画，代码绘制邮票标题、编号、细纸边与透明齿孔 |
| `src/App.jsx` | 系列筛选、语义按钮、聚焦说明和无WebGL回退 |
| `src/rendering/StampGallery.js` | 一个Renderer和RAF；画廊、筛选、输入、聚焦及GPU资源生命周期 |
| `src/rendering/StampMaterial.js` | 悬停局部暖光、浅纸纹、柔化与票面透明边缘；不全图乘色 |
| `src/rendering/DappledLight.js` | 邮票局部光图、颜色和散焦；桌面纸色单独静态输出 |
| `src/parameters.js`、`src/ParameterPanel.jsx` | 光影、纸纹、投影与交互参数保存和实时调整 |

## 研究与历史

- [地域邮票图稿、生成提示摘要与资产校验](docs/region-stamps.md)
- [原站邮票光图与GPU参数核对](docs/ncs-light-source-audit.md) · [纸面适配边界](docs/ncs-environment-source.md) · [参数说明](docs/parameter-guide.md)
- [研究总览](docs/research.md) · [实际网页观察](docs/web-research.md) · [视频分析](docs/video-analysis.md) · [幽兰场景8审计](docs/scene8-audit.md) · [架构决策](docs/architecture.md)
- [快速切换光影修复记录](docs/rapid-hover.md)
- [此前八态邮票存档](docs/lion-stamps.md)

每轮项目修改按根 `AGENTS.md` 和 [工程记忆协议](wiki_memory/README.md) 更新记忆、完成验证并本地提交；不自动推送或发布。
