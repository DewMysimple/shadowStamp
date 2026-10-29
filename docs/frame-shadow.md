# 相框下缘条带阴影修复

2026-10-29，桌面 main 基于 `f29710d`，只修改 `runGo.cmd` 的地域新版。用户两张标注图指出相框下方投影出现横向分层、拖成阶梯状的灰带。本轮处理这个墙影缺陷，保留现有相框占比、图稿、照片、文字、三灯、HDRI、邮票和交互。

## 原因与修复

原 `FrameContactShadow.js` 每盏圆盘使用32个固定位置的硬遮挡射线，然后直接混合到画面。长直框边会同时跨过一整排采样阈值，因此出现横向台阶；放大相框后更明显。这是墙影离散采样问题，与上一轮内饰线的20µm深度间隙不同。

[Three官方RectAreaLight文档](https://threejs.org/docs/pages/RectAreaLight.html)明确没有原生面光阴影支持。本轮参考[安装版本r185的接触阴影示例](https://github.com/mrdoob/three.js/blob/r185/examples/webgl_shadow_contact.html)，通过已有Three模块导入水平、垂直Gaussian滤波，只过滤阴影可见度：

1. 仍由原三盏灯的实际位置、方向、直径、颜色亮度与功率决定遮挡；每盏固定射线由32增至128，没有增加灯具或使用时间随机数。
2. 在1.8×1.1m墙面上，以1024×626的RGBA16F目标保存可见度，并使用一个同规格中间目标。滤波期间保留浮点过渡，最终画面仍由浏览器正常输出。
3. 执行水平／垂直两遍Gaussian，再作0.4倍步长清理。基础步长为 `0.0016 × sqrt(shadowSoftness)` 米，按墙面尺寸转为UV，因此不会随桌面DPR或显示尺寸改变物理尺度。
4. 平滑的投影与原模型合成。原PBR模型、照片、木纹和文字均不进入模糊通道，源灯值、模型显示变换与页面底色不作调整。
5. 缓存阴影单独比较整框矩阵、灯具和柔和度。曝光、分类文字动画及单纯视口缩放无需重新积分；关闭投影时暂停该计算。卸载时释放两个目标及滤波材质，继续使用原唯一Renderer和按需RAF。

原PBR圆盘LTC仍为32边；128指的是墙影每盏灯的可见度射线数，不能混淆。墙影继续采用闭合相框外轮廓的射线／包围盒近似，不计算Cycles完整自遮挡、HDRI直接阴影或路径追踪GI。原照片和资源文件未改。

## 可重现的像素证据

`editions/regional/scripts/verify-frame-shadow.mjs` 从Git读取 `f29710d` 的原相框／阴影模块，通过独立浏览器路由加载旧实现，然后与当前代码在同一2560×1440视口比较。没有改写工作区源码来制作“之前”的画面。

- 三条墙面剖面的最大相邻斜率突变约2.29／2.35／2.50降至1.02／1.03／1.01个8位灰阶，横向台阶明显减少；接触阴影仍可见，保留近深远浅的层次。
- 相框内部、四枚邮票和静态页面共1116个RGB采样点与旧实现完全相同；同时核对材质、三灯与投影矩阵。
- 实际GPU捕获到一个WebGL上下文、两个1024×626离屏目标。半浮点阴影中间值超过一万种；FLOAT回读无GL错误，驱动建议回读类型为HALF_FLOAT。
- 四角最大5°、柔和度0.25／2、浓度0／0.8、黑色灯光、固定指针重复采样、缓存和双目标释放均通过。参数恢复后静态截图保持正常。

当前报告、剖面和前后截图在 `editions/regional/artifacts/frame-shadow/`：`report.json`、`shadow-profiles.json`、`shadow-gpu.json`、`before-2560.png`、`final-2560.png`、`final-shadow-detail.png`。专项脚本的前两次脚手架结果单独保留：首次遗漏基线GLTFLoader的Vite路径转换；第二次把驱动推荐HALF_FLOAT误判为错误，并在模拟窗口缩放产生真实指针移动时错误断言姿态不变。最终检查接受正确的浮点回读类型，并固定物理姿态核对缩放缓存。

本轮源模型与E盘素材仍只读；原版 `runStart/4173`、启动器、依赖和用户未跟踪目录保全。只作本地提交，不推送或部署。

## 本轮实际验证

在 `editions/regional` 执行：

| 命令 | 结果 |
| --- | --- |
| `npm test` | 25/25 |
| `node scripts/verify-frame-shadow.mjs` | 7/7，包含真实旧版基线与新墙影GPU像素 |
| `VERIFY_OUTPUT=artifacts/frame-shadow/studio node scripts/verify-frame-studio.mjs` | 14/14，源灯、接缝、控件、独立存储与稳定性 |
| `VERIFY_OUTPUT=artifacts/frame-shadow/integration node scripts/verify-art-frame.mjs` | 19/19，原资产保全、分类、十二邮票、聚焦、六算法、异常回退 |
| `VERIFY_OUTPUT=artifacts/frame-shadow/density node scripts/verify-frame-density.mjs` | 3/3，125%、150%、200%实际GPU视口和射线 |
| `npm run build` | 通过，原有Three块体积提示保留 |
| `VERIFY_OUTPUT=artifacts/frame-shadow/production VERIFY_FRAME_REFERENCE=artifacts/frame-shadow/studio/final-runtime.json node scripts/verify-frame-production.mjs` | 通过，实际生产128射线程序、两种Gaussian程序、1Canvas/Context、无DEV API、中国分类和曝光保存 |

表中环境变量采用简写；PowerShell使用 `$env:VERIFY_OUTPUT='...'` 赋值。生产脚本的参考坐标输入和报告输出分别指定，避免覆盖上一轮证据。首次生产检查因参考输入路径仍跟随新输出目录而中止，该脚手架失败记录单列保留；修正后实际构建检查通过。当前GPU为本机Chrome/ANGLE、RTX5070Ti/D3D11；不代表低端真机帧率。
