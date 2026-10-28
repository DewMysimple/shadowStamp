# 相框稳定渲染、微旋转与源摄影棚布光

2026-10-29，继续桌面 main 的 4994b1d，只修改 runGo/4174 地域新版。原木框、照片、画芯、文字资产、12 枚邮票和六种邮票光影保留；Modeling 源工程及 E 盘 EXR 只读。

## 当前使用方式

左上“相框光照 / 模型参数”打开相框专属面板，默认收起。可以预览、下载用户提供的 4K EXR，调 HDRI 开关/强度/方向、原世界光、曝光，以及三盏灯的开关、功率、圆盘直径、颜色、位置和旋转。纸木法线、墙面投影浓度/柔和度和微旋转幅度/响应也可调。支持单灯恢复、全部恢复、独立 JSON 导入导出与本机保存。

面板的位置、灯位图和字段均为本轮实现；数值使用 Blender 原坐标（X 左右、Y 前后、Z 上下），位置以米、旋转以度显示。原底部邮票参数面板保留，相框参数使用独立的 `postal-studies:frame-studio:v1` 存储，不迁移或覆盖邮票参数。

整个相框跟随指针轻微旋转，默认最大 2.5°、响应时间常数 0.16 s，面板允许 0–5°。使用轻透视呈现近远变化，移出、进入参数面板或邮票聚焦时平滑归位；系统减少动态时关闭旋转。三组文字的原有射线点击、键盘选择与邮票聚焦仍可使用。

## 源文件的实际灯具

由 `F:/Blender/blender.exe --factory-startup -b SOURCE.blend --python editions/regional/scripts/inspect-frame-studio.py -- OUTPUT.json` 读取用户指定的 `C:/Users/Administrator/Desktop/Modeling/相框/Models/ArtFrame_2to1/ArtFrame_2to1.blend`。没有另存或覆盖源文件。当前源数据为 `editions/regional/src/data/frame-studio-source.json`。

源场景恰有三盏 AREA / DISK 灯，功率已归一化，温度控制关闭，无灯具约束或节点覆盖。以下旋转为源文件的 Blender XYZ 欧拉角，表中作显示舍入，运行时保留完整精度：

| 源灯具 | 功率 | 圆盘直径 | 源位置 X / Y / Z，m | 源旋转 X / Y / Z，° | 线性 RGB |
| --- | --- | --- | --- | --- | --- |
| Key · large softbox | 18 W | 0.85 m | −0.65 / −0.95 / 1.05 | 47.6295 / 0 / −34.3803 | 1 / 0.96 / 0.90 |
| Fill · gentle frontal bounce | 8 W | 0.80 m | 0.75 / −0.65 / 0.35 | 70.5746 / 0 / 49.0856 | 0.90 / 0.95 / 1 |
| Rim · timber edge | 8.5 W | 0.50 m | 0.55 / 0.025 / 0.75 | 36.2820 / 0 / 92.6026 | 1 / 0.96 / 0.89 |

源 World 为线性 RGB `(0.70, 0.74, 0.78)`、强度 0.16；显示为 AgX / Medium High Contrast / 曝光 +0.4 EV。网页恢复该世界辐射和显示变换，另保留用户此前指定的 HDRI：默认强度 0.12、水平旋转 63°。关闭 HDRI 可单独查看源三灯加世界光。

坐标按 `(X,Y,Z) → (X,Z,−Y)` 转换，完整灯具旋转一起变换，不仅使用 `lookAt` 猜方向。真实浏览器还核对了 GPU 上传的三个位置、半宽方向和灯色×辐射强度；网页 Scene 实际只有三盏光，没有额外方向光。源矩阵、转换后四元数与实际 GPU 值分别保存在 `gpu-source-match.json`。

Three 的 [RectAreaLight](https://threejs.org/docs/pages/RectAreaLight.html) 原生为矩形，且没有面光源阴影。本轮沿用官方 LTC 表、BRDF 和地平线裁剪，只把四角边界积分改为 32 边圆盘积分，逻辑与 GPU 灯具数量均为三。辐射强度使用 `W / (圆盘面积 × π)` 的相对场景线性单位；没有把 Blender 的瓦特误称为 Three `.power` 的流明。32 边边界和 LTC 本身仍是实时近似，不宣称与 Cycles 逐像素相同。

## 闪线原因与实际修复

直接读取 GLB accessor 和节点变换后，画芯正面为 Z=0.01100000017 m，两条内饰线背面均为 Z=0.01102000009 m，间隙只有约 **20 µm**。两个原饰线材质也均启用了双面。几何证据见 `geometry-evidence.json`。

检查安装的 Three 0.185.1 与真实 GPU 代码发现，LTC 在视线与表面法线平行时直接归一化零切向量。薄长饰线和照片是平面，微旋转会经过这个状态，可能出现异常暗线。新积分在该状态建立有效的备用正交基底；实际编译的 Shader 已验证包含该分支。适配按函数括号结构定位，不能依赖 Three 发布包中已经删掉的 Shader 注释；单元测试及生产版冒烟覆盖了此前静默不生效的问题。

稳定措施同时覆盖深度、绘制顺序和采样：

- 相框相机深度范围由 0.1–10 m 收紧为 1.8–2.2 m。两个封闭饰线仅渲染正面，各用 −2 / −1 个深度偏移单位解除共面接缝的平局，不移动顶点或改变 UV。
- 原模型始终在不透明深度通道中渲染。邮票聚焦时淡出整个相框合成图，不反复改变实体材质的透明属性和绘制列表。
- 相框离屏目标采用 4×MSAA、约 2 倍分辨率及 mipmap 下采样，最长边限制为 4096 或设备上限。加载完成前预编译实际目标与色调映射的 Shader，避免首屏文字漏绘。
- 离屏目标使用其自身的物理像素视口；不再次调用会乘共享Renderer DPR的setViewport。本轮125%桌面验收发现并修正了二次DPR造成的放大裁切，专项直接拦截实际PBR绘制时的GPU视口验证。
- 移除上一版额外方向光和 VSM 自投影。墙面投影从同三盏圆盘使用固定采样投射到源 Backdrop 位置 Z≈−0.03 m，不使用时间随机数；边缘平滑衰减。相框微转时维持背面最邻角与墙的间隙。

墙影使用闭合相框外轮廓的射线/包围盒近似，不计算 Cycles 的全部自遮挡、HDRI 直接阴影或路径追踪 GI。页面原背景颜色保持，只有相框自身的投影随姿态变化；HDRI、LUT 与曝光始终局限在相框视图。

同一个 Renderer / Canvas / 按需 RAF 仍由 StampGallery 管理。相框静止时缓存离屏图，即使邮票动画唤醒画廊，也不重复绘制相框 PBR。相框完成后恢复共享 Renderer 状态；模型、图片、PMREM、LUT、渲染目标、几何与监听均在原生命周期内释放。[Material](https://threejs.org/docs/pages/Material.html)、[RenderTarget](https://threejs.org/docs/pages/RenderTarget.html) 和 [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) 是对应官方依据。

## 实际验收

本轮真实命令与结果：

| 检查 | 结果 | 主要范围 |
| --- | --- | --- |
| 地域新版 `npm test` | 25/25 | 原功能、源三灯矩阵、参数安全与存储往返、发布版 Shader 适配 |
| 原版根 `npm test` | 19/19 | 原版与启动器保全 |
| 两版 `npm run build` | 均通过 | 仍有 Three 块体积提示 |
| 新版 `node scripts/verify-frame-studio.mjs` | 14/14 | 真正 GPU 三灯、连续接缝、整框微转、真实模型控件、存储、隔离与清理 |
| 新版 `node scripts/verify-frame-density.mjs` | 3/3 | 125% / 150% / 200%桌面缩放、实际PBR绘制视口与CSS射线注册 |
| 新版 `node scripts/verify-art-frame.mjs` | 19/19 | 三分类/十二图稿、聚焦、键盘、桌面布局、错误回退、资产哈希 |
| 新版 `VERIFY_OUTPUT=artifacts/frame-stability/preset-regression node scripts/verify-light-presets.mjs` | 8/8 | 六算法实际 GPU 分支、竖/横票面、背景、导入导出及减少动态 |

相框专项对用户标出的上下内框、极细外边和两条饰线交界共 **1932 个采样点**，连续检查 **18 个指针姿态**，最低颜色通道值 175/255，没有突发黑条。指针变化 0.05 CSS px 时，平均通道差约 0.0112、最大 1/255，固定指针后像素完全一致。自然旋转中的亚像素边缘覆盖变化仍属于正常抗锯齿，未把它误当时间随机闪烁。

五种桌面尺寸为 1024×768、1280×720、1440×900、1920×1080、2560×1440，均验证四角 5° 参数上限与完整显示。另验125%（1536×864 CSS → 1920×1080物理像素）、150%及200%缩放；真实后端为本机Chrome/ANGLE Direct3D11、NVIDIA RTX 5070 Ti，相关证据见desktop-density.json。图稿、GLB、源 blend、源 EXR、原版运行文件与启动器按哈希/差异核对保全。未做手机优化或公网部署；45.7 MB GLB 与 70.7 MB EXR 的首载开销保留。

生产版另用 `node scripts/verify-frame-production.mjs`，在125%缩放和临时本地端口检查构建产物的实际 GPU、三维分类和模型控件，不使用开发诊断 API；报告为 `production-smoke.json`。

当前证据统一放在 `editions/regional/artifacts/frame-stability/`：`report.json`、`gpu-source-match.json`、`seam-traversal.json`、`geometry-evidence.json`、`final-runtime.json`，以及 `integration/` 和 `preset-regression/`。最终截图以 `final-*` 命名。首次验收中的数组默认字典排序及折叠面板定位错误保留在 `initial-harness-report.json`，这些检查后来已按真实用户操作修正并重新通过。

## 修改入口

- `src/rendering/ArtFrame.js`：稳定实体通道、轻透视微旋转、离屏缓存、共同坐标射线与资源清理。
- `src/rendering/FrameStudio.js`、`FrameDiskLight.js`、`FrameDisplay.js`：源三灯、圆盘积分、安全基底、世界光与 AgX 输出。
- `src/rendering/FrameContactShadow.js`：同源灯位的确定性墙影。
- `src/frameParameters.js`、`src/data/frame-studio-source.json`、`src/FrameParameterPanel.jsx`：独立参数、原始来源和左上交互面板。
- `src/App.jsx`、`StampGallery.js`、`styles.css`：React 接线、事件隔离、现有单一 Renderer 与界面。
- `scripts/inspect-frame-studio.py`、`build-frame-environment-preview.py`：源文件只读提取与 HDRI 预览生成。
- `tests/frame-studio.test.js`、四个 frame 验收脚本：数值、GPU、视觉、桌面缩放、生产构建和交互证据。

本轮仅本地提交；没有推送、部署、修改其他项目或暂存用户的 `prompt/`、`source/Picture_01/`。
