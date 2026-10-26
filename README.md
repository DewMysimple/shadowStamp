# Postal Studies · 醒狮八态

React + Vite + 原生 Three.js。使用用户lion工程中的喜、怒、哀、乐、动、静、惊、疑八张完整神态图，分别设计八枚邮票：米白票纸、朱红题签、双语态名、01–08编号和透明齿孔。原有悬停暖光、浅纸纹、聚焦、参数与输入机制保留，背景为静态暖白纸面。

[八枚票面总览](artifacts/lion-stamps/stamps-contact-sheet.png) · [独立PNG](artifacts/lion-stamps/prints/) · [素材与设计说明](docs/lion-stamps.md)

2026-10-27已修复快速切卡的光影延迟：新票在恢复清晰的同时开始出光，共享光图在首帧交接到新票指针位置，不再等待约半秒。保留原渐入/渐出与虚化参数，详见[切换修复与实测](docs/rapid-hover.md)。

## 运行

需要 Node.js 22.12+（本机验证为24.16）。在本目录运行：

```powershell
npm install
npm run dev
```

打开终端打印的地址，默认 [http://127.0.0.1:4173/](http://127.0.0.1:4173/)。端口占用时 Vite 会选择后续端口。

- 悬停后，纸面反光与细微压纹随指针方向渐显，移出渐隐。静态图稿中已移除此前额外绘制的粗波纹；没有凸起浮雕、立体字边或金属化。
- 悬停也显示名称、抬升当前票并虚化其他票；点选进入暗色聚焦。
- 点击、右上返回或 Escape 退出；触屏直接点选。
- 聚焦后可在票内继续移动鼠标或拖动手指，引导局部光照。支持键盘和减少动态偏好。
- 左上角“参数控件”直接调节光色、暗部、纹理放大、光斑散焦、周围投影及原有偏转/聚焦。支持单组/全部重置、本机自动保存及JSON导入导出；聚焦后仍可调参。

光影沿用前轮已完成的NCS源码/GPU参数适配，本轮没有调整灯色、光图、法线或光学算法。见[源码与参数对照](docs/ncs-light-source-audit.md)、[灯光实测](docs/ncs-environment-source.md)、[参数说明](docs/parameter-guide.md)。

用户后续明确要求光效作用在**悬停邮票表面**，最终版本不显示票面彩虹色带、不把动态光影铺在背景上，也不提供额外的背景光影模式。

## 构建与验证

```powershell
npm run build
npm run test
# 保持开发服务启动，再开一个终端：
npm run test:stamps
npm run test:rapid-hover
npm run test:browser
npm run test:light
npm run test:controls
npm run test:fidelity
```

浏览器脚本使用本机安装的 Chrome（Playwright channel: chrome），不要求下载额外浏览器。其他端口可设置 `VERIFY_URL`。八态验收位于 `artifacts/lion-stamps/verification/`，原有机制的回归脚本已适配八枚，写入 `artifacts/lion-stamps/regression/`。前轮光影报告保留原目录。`npm run preview -- --port 4280 --strictPort` 可预览生产构建。

## 代码与参数

| 文件 | 职责 |
| --- | --- |
| `src/App.jsx` | 图稿预解码、语义按钮、键盘说明和无WebGL纸面回退 |
| `src/config.js` | 八态元数据、图片路径、布局/角度/尺寸/层级、聚焦时间 |
| `src/parameters.js`、`src/ParameterPanel.jsx` | 四组实时参数、验证、保存与导入导出；仅一个默认效果 |
| `src/artwork.js` | 八张神态图的一次解码、统一票面排版和真实alpha齿孔 |
| `src/rendering/SurfaceTexture.js` | 独立于印刷图稿的细密表面法线，创建一次并随材质释放 |
| `src/rendering/StampGallery.js` | 一个renderer、一个RAF、统一坐标/输入/生命周期 |
| `src/rendering/StampMaterial.js` | 局部UV采样光场、按hover强度合成纸面暖光、连续alpha虚化 |
| `src/rendering/ncsLighting.js` | 原站实码与GPU核实的主光/橙暖点光及非金属浅纸面参数 |
| `src/rendering/DappledLight.js` | 384×480邮票光场、强度/速度/颜色/柔化/覆盖范围/开关与缓存 |
| `src/rendering/dappledShaders.js` | 场景8原始光场、50采样散焦、静态纸面输出 |
| `src/motion.js` | 可在中途反向的统一聚焦进度 |

八张1254×1254透明原图复制在`public/assets/lion-states/`，与用户源图逐字节一致，E盘工程未改动。票面Canvas首次生成后复用；没有运行时远程图片、字体或CDN依赖。`node scripts/capture-lion-stamps.mjs`可重导出八张720×900透明齿孔PNG与总览。

## 工程记忆与Git

使用用户指定的 **standard** 工程记忆：[wiki_memory/README.md](wiki_memory/README.md)。新会话按根 `AGENTS.md` 和记忆协议读取当前状态。

每轮完整对话只要修改本项目文件，结束前须同步相关记忆、验证并完成本轮本地Git提交；无修改不空提交。不自动推送或发布。仓库已初始化在本工程目录，基线提交为 `2345174`；当前交付状态以 `git status` / `git log -1` 为准。

## 研究与交付记录

- [研究总览](docs/research.md)、[实际网页观察](docs/web-research.md)
- [视频286帧分析](docs/video-analysis.md)、[幽兰场景8审计](docs/scene8-audit.md)
- [架构](docs/architecture.md)、[画面对比](docs/visual-comparison.md)
- [工程验收与文件清单](docs/validation.md)
- [本轮4段视频分析](docs/controls-video-analysis.md)、[网站重新实测](docs/controls-web-research.md)、[场景8参数映射](docs/controls-scene8.md)

初始六票与早期视频/原站研究属于历史。当前为用户授权的醒狮八态图稿，沿用本工程纸面材质与交互，并非复制原站插画。光影适配范围与差异继续见源码审计。
