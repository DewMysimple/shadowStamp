# 最终交付与实际验收

日期：2026-10-26。最终实现按用户最新直接要求：**场景8的自然光效作用于鼠标悬停的邮票内部，背景保持静态暖白**。没有背景动态光影模式，也没有票面彩虹色带。

本轮新增4组46项实时参数，按用户给出的4段录屏、原站最新实测修正聚焦透视/方向/响应，加入实际图稿的细微压纹光照。使用方式及差异见[参数说明](parameter-guide.md)，研究输入见[视频分析](controls-video-analysis.md)、[网站实测](controls-web-research.md)、[场景8映射](controls-scene8.md)。

## 实际执行结果

| 检查 | 结果与证据 |
| --- | --- |
| `npm run build` | 成功。Vite8.2.2；主JS约245kB、gzip约81kB，Three依赖约514kB、gzip约129kB。构建有500kB依赖块提示，非失败。 |
| `npm run test` | 9项通过：可逆运动、布局边界、参数JSON安全归一化/保存、光场开关/调度/范围契约。 |
| `npm run test:browser` | 14项真实Chrome/WebGL验证全部通过；[JSON](../artifacts/verification/browser-report.json)。 |
| `npm run test:light` | 9项票内光场专项全部通过；[JSON](../artifacts/light-study/final-report.json)。 |
| `npm run test:controls` | 20项新面板专项全部通过，包含真实GPU参数/像素而非仅检查React状态；[JSON](../artifacts/controls-verification/report.json)。 |
| `node scripts/verify-production.mjs` | 生产构建4174端口HTTP200，4项通过：桌面聚焦内调参/保存/导出/重载/退出、手机真触摸、禁止localStorage仍可调参、零console warning/error和pageerror；单canvas、生产不暴露DEV诊断；[JSON](../artifacts/controls-verification/production-report.json)。 |

主浏览器检查包括1440×900与390×844的初态/hover/转场中段/聚焦/返回截图、6枚鼠标点选与真实触摸、Tab/Enter/焦点恢复、快速反向与改选、10轮材质/纹理UUID和GPU计数稳定、聚焦resize、无横向溢出、减少动态、双dispose、真实context loss与禁WebGL回退。所有正常WebGL场景无console error或pageerror；刻意禁WebGL时仅允许Three报告无法创建context。

票内光场专项不仅检查截图：留白背景PNG像素哈希在悬停前后完全一致，当前票像素发生变化；冻结GLSL的uTime后移动局部UV，384×480离屏纹理哈希仍变化，确认指针实际控制光场而非只倾斜纸票。离开后时钟、更新计数、纹理冻结。昂贵计算受24fps上限控制。手机CDP真实touchMove已验证，修复了原生手势接管造成的pointercancel。

面板专项覆盖4组46字段、22个光学最小/最大值实际GPU上传、光色/形态/压纹的真实票面像素变化、强度0/关闭/暂停的RAF停止与背景ROI稳定、聚焦四方向±4.56°采样/移出保留/可选回正、500↔4000px实际投影变化、JSON文件下载/导入/刷新持久化、无效数据、触摸调参、减少动态和资源UUID稳定。CSS点击区域与GPU投影角点最大测得误差.684px；改变透视时最大角点位移75.323px。

测试中发现并已修复两项实质问题：光学适配器沿用旧场景范围导致滑杆静默截断，现直接从面板schema派生边界；React委托事件晚于native host监听，面板点击曾触发背景退出，现native监听显式忽略面板。聚焦内复测checkbox、number、summary、单组重置均保留聚焦，Tab可到达分组标题并用Enter展开。

## 最终截图与动态演示

- [新参数面板](../artifacts/controls-verification/01-desktop-panel.png)、[聚焦内调参](../artifacts/controls-verification/03-focused-pointer.png)、[手机参数面板](../artifacts/controls-verification/04-mobile-panel.png)
- [3.5秒真实聚焦偏转演示](../artifacts/controls-verification/focused-pointer.webm)、[原站/上一版/本轮三列对照](../artifacts/controls-research/video-original-previous-current.jpg)

- [桌面初态](../artifacts/verification/desktop-01-initial.png)、[悬停](../artifacts/verification/desktop-02-hover.png)、[转场中段](../artifacts/verification/desktop-03-mid-transition.png)、[聚焦](../artifacts/verification/desktop-04-focus.png)、[返回](../artifacts/verification/desktop-05-return.png)
- [手机初态](../artifacts/verification/mobile-01-initial.png)、[手机聚焦](../artifacts/verification/mobile-04-focus.png)、[手机票内光](../artifacts/light-study/final-mobile.png)
- [票内光效最终图](../artifacts/light-study/final-hover.png)、[5秒真实悬停演示](../artifacts/light-study/light-motion.webm)
- [参考与结果并排](../artifacts/comparison/reference-vs-result.jpg)、[定量对照说明](visual-comparison.md)

早期 `artifacts/visual/`、`artifacts/review/` 和光影目录中的编号图记录调试过程，不是最终验收结果。最终以verification目录、final-*图片、final-report和上述短片为准。

## 文件清单

初始目录没有代码，因此以下均为新建工程文件，没有覆盖旧前端：

- 根配置：`package.json`、`package-lock.json`、`vite.config.js`、`index.html`、`.gitignore`、`README.md`。
- 页面：`src/main.jsx`、`src/App.jsx`、`src/styles.css`、`public/favicon.svg`。
- 配置与运动：`src/config.js`、`src/motion.js`、`src/parameters.js`、`src/ParameterPanel.jsx`。
- 印刷与渲染：`src/artwork.js`、`src/rendering/StampGallery.js`、`StampMaterial.js`、`DappledLight.js`、`dappledShaders.js`。
- 验证：`tests/motion.test.js`、`tests/parameters.test.js`、`tests/dappled-controls.test.js`、`scripts/verify-browser.mjs`、`scripts/verify-light.mjs`、`scripts/verify-controls.mjs`、`scripts/verify-production.mjs`。
- 研究辅助：`scripts/research-scene8.mjs`、`scripts/compare-reference.py`、`scripts/research-controls-web.mjs`、`scripts/analyze-controls-videos.py`、`scripts/compare-controls-videos.py`。
- 文档：`docs/research.md`、`architecture.md`、`scene8-audit.md`、`web-research.md`、`video-analysis.md`、`visual-comparison.md`、`validation.md`。
- 本轮增补：`docs/parameter-guide.md`、`controls-video-analysis.md`、`controls-web-research.md`、`controls-scene8.md`，`artifacts/controls-research/`与`artifacts/controls-verification/`。
- 证据：`docs/reference/`、`artifacts/research/`、`artifacts/verification/`、`artifacts/light-study/`、`artifacts/comparison/`。
- `dist/`为已实际构建的生产输出；`node_modules/`为本机已安装依赖，均被Git忽略。

## 保留资产与已知差异

「幽兰」源工程未修改，原场景8文件SHA-256核对一致。迁移的field/50采样blur导出字符串与原文件逐字相同，重写的是渲染组织、局部坐标适配、静态纸面输出和票内合成。原参考MP4保留。

目标初始目录与本次搜索的幽兰src中未找到任务文件描述的既有邮票镭射Shader；因此没有声称复用一个未取得的资产。最终纸面光照材质为新建适配模块。

六枚邮票图案为原创程序化设计，接近参考的设计语言，不能宣称逐像素复原原画。参考视频宽高比91:61，桌面验收8:5；比例关系保持，焦点票桌面保留参考略偏左的重心，手机严格居中。视频没有退出与手机片段，这两者为独立实现。非选中票的GPU多采样虚化与浏览器高斯滤镜仍有细微纹理差异。

性能测试在本机Chrome、部分光场观测使用软件WebGL，不能等同于低端真机的帧率保证。无WebGL回退保留原创邮票和聚焦操作，无法提供同样的动态光场。
