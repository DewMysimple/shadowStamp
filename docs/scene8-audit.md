# 幽兰场景8：只读审计与迁移记录

最终集成用途已按用户后续直接要求调整：本报告中的原场景8全屏图仅作研究证据；成品将原field/50采样blur生成384×480的离屏光场，以当前悬停邮票的局部UV采样，光只在票内出现。背景保持静态暖白，没有独立背景光影模式。最终实现和证据见 `docs/architecture.md` 与 `artifacts/light-study/final-report.json`。

审计日期：2026-10-26。原工程 `E:\Software Development\幽兰` 可访问，未修改其任何源文件、依赖、配置或工程记忆。本次运行前后核对了相关源文件 SHA-256，完全一致；证据见 `artifacts/research/scene8/runtime-report.json`。

## 入口与编号确认

- `E:\Software Development\幽兰\src\App.jsx`：React effect 挂载 `createSpecimenViewer`，卸载调用返回的清理函数。
- `E:\Software Development\幽兰\src\viewer\sceneCatalog.js:2`：当前顺序第8项为稳定 ID `dappled`，显示名“场景8·斑驳光影”。部分旧日志称“场景7”，原因是后来插入开场场景并顺延编号；不能按旧日志编号找文件。
- `E:\Software Development\幽兰\src\viewer\createSpecimenViewer.js:435`：创建控制器并传入已有共享 renderer；391行进入独立更新和绘制分支；514行同步尺寸；732行清理。
- `E:\Software Development\幽兰\src\viewer\sceneSwitcher.js:175`：独立场景的 activate/deactivate；二维模式禁用 OrbitControls，退出恢复原控制器；357行传播减少动态偏好。
- `E:\Software Development\幽兰\src\viewer\dappledLightScene.js`：完整控制器、离屏资源、指针输入和参数面板。
- `E:\Software Development\幽兰\src\viewer\dappledLightShaders.js`：自定义场、镜头散焦与最终合成 GLSL。

读取了根 AGENTS.md 指定的四份当前状态文档。用户要求原工程只读，因此未执行其“修改任务后写日志、提交、推送”规则：本次没有在该工程实施修改任务。

## 实现原理与逐项回答

| 问题 | 代码与运行结论 |
| --- | --- |
| 1. 如何产生斑驳 | 屏幕UV先旋转、拉伸，再用3×3邻域Voronoi选择最近随机点；随机点受连续正弦时钟驱动。winner偏移UV，叠加正弦波变形，再采样以指针为中心的椭圆软光场。 |
| 2. 是否Three.js | 是，共享现有 `WebGLRenderer`，独立 `Scene`、正交相机与全屏平面。没有树木或三维投影模型。 |
| 3. 是否自定义GLSL | 是：`DAPPLED_FIELD_FRAGMENT`、`DAPPLED_BLUR_FRAGMENT`、`DAPPLED_OUTPUT_FRAGMENT` 三个片元阶段。 |
| 4. 噪声/位移 | 使用确定性hash生成Voronoi种子，连续正弦移动种子、扭曲UV；不使用Perlin/Simplex或位移贴图。 |
| 5. CSS/SVG/Canvas | 光影由WebGL Canvas绘制；CSS只管页面壳和GUI，没有SVG滤镜或Canvas2D光影计算。 |
| 6. 驱动来源 | 时间、用户GUI参数、归一化指针和帧率无关的指数阻尼。 |
| 7. 时间变量 | `uTime`。从3起步，每帧加 `clamp(dt,0,.1) * 2 * speed`；隐藏、非活动暂停，避免切回时积分整段离开时间。 |
| 8. 鼠标 | Canvas pointermove/down映射至UV，Y轴翻转；0.16秒指数阻尼；离开、取消或窗口blur回中；reduced motion禁用跟随。 |
| 9. 多层 | 两个离屏目标、三次绘制。第一pass已将概念上的多次source-over解析合并；第二pass为50次黄金角盘状散焦；第三pass五点重建、暖色纸面overlay与细颗粒。 |
| 10. 外部纹理 | 不需要。仅依赖自己生成的两张RT纹理，默认背景色彩也为程序计算。 |
| 11. 性能瓶颈 | 最贵是50次纹理采样散焦，每个活动帧执行两次离屏加一次输出。原实现将离屏限制半CSS分辨率、最多1280×720，DPR不放大离屏负担；移动设备仍值得降低更新率。syncUniforms每帧创建少量Vector3，可改原位赋值。 |
| 12. 清理/重复渲染 | dispose幂等；删除5个事件监听，移除平面，释放共享几何、3材质、2RT。外部统一requestRender会拒绝重复RAF与隐藏状态；动画关闭且指针收敛后按需绘制。实际运行资源回到0几何/0纹理。未发现这个模块的资源泄漏。 |
| 13. 能否独立复用 | 能。仅依赖Three和场景标签（标签只供GUI命名）。可以保留GLSL并移除原GUI、事件与独立调度，使目标工程使用单renderer/单RAF。 |

原依赖为 React 19.2.8、Three 0.185.1、Vite 8.2.2；原Vite把裸 `three` 别名到 `source/threejs-transmission/build/three.module.js`。本次只读验证壳直接载入原场景控制器和原着色器，使用原 `node_modules/three` 浏览器ES模块，不启动其他大场景及模型加载链。原工程完整多场景应用未重新跑全量回归。

## 运行观感与比较边界

原始中心截图：`artifacts/research/scene8/01-original-center.png`。可以直接观察到斜向、拉长、柔边的光斑，色调为珊瑚底、浅橙光。它具备叶影般的不规则轮廓，但在高对比原参数下少量长边仍有条纹状散焦痕迹；不适合直接铺到暖白邮票背景。指针移到左侧后光区分布明显随之迁移，证据为 `02-original-pointer-left.png`。

此审计没有把旧日志关于Microsoft原站的描述当成当天实测。独立网站研究实际访问并观察了当天原站的WebGL2多pass：椭圆光场、正弦UV、9邻域animated Voronoi、黄金角50采样bokeh、blue-noise纹理与overlay合成；详见 `web-research.md` 和 `reference/web/microsoft-observations.json`，截图为 `reference/web/microsoft-light-0.png` 等。这与本地场景8的核心形态链一致，但本地用确定性hash及程序纸色替代原站的噪声和叠加图片，不能声称两者资源及合成逐像素一致。

## 复用决定：C，保留算法，重组组件

在目标工程新增：

- `src/rendering/dappledShaders.js`：保留原场生成和50采样散焦算法原文；重写最后合成，移除珊瑚色纸面overlay，输出暖白纸面与深灰聚焦背景。
- `src/rendering/DappledLight.js`：不创建renderer、RAF或事件，接收同一个renderer，由主程序传时间和鼠标。两个离屏pass最多24fps，40% CSS分辨率，最大960×600；静止、减少动态或聚焦末态复用缓存；始终绘制轻量输出供邮票叠加。

首轮移植的参数为：强度 `.16`，速度 `.13`，暖白 `#f6f3eb`，阴影 `#8c9485`，光色 `#fffbee`，柔化 `1.6`，覆盖 `.7`，聚焦 `#24231f`。指针影响仅原UV移动的14%，0.6秒缓动。焦点进度连续混合背景，整个迁移不碰原工程文件。用户随后明确重点为Microsoft/场景8背景光，主开发继续调高背景可见度并接入LIGHT STUDY模式；最终有效参数以目标 `DappledLight.js` 为准，首次移植截图是算法适配记录，不能代替最终验收截图。

暖白迁移截图：`artifacts/research/dappled-adapted/01-adapted-paper.png`。暗色与390×844截图在同目录。迁移控制器接口：`createDappledLight(renderer, options)` 返回 `resize / render(timeSeconds, focusProgress, reducedMotion) / setPointer(normalizedX, normalizedY) / dispose / parameters`。`setPointer`的Y轴按WebGL UV向上，由主控制器转换。

## 实际验证

1. `node --test "E:\Software Development\幽兰\tests\dappledLight.test.js"`：原Motion 3项测试通过，覆盖30/120Hz一致性、反转、隐藏/非活动、减少动态与参数边界。
2. `node scripts/research-scene8.mjs`：Chrome真实WebGL读取原文件。1440×900、390×844；单Canvas/3个程序/1个几何/2张RT纹理。指针(340,300)映射为(0.2361111,0.6666667)，暂停与reduced motion停止重绘；重复dispose释放1几何/2纹理；无控制台错误；SHA256前后相同。
3. `node scripts/research-scene8.mjs --adapted`：迁移着色器编译和绘制成功。连续0.01/0.042/0.05秒调用的绘制次数为1/3/1，证明缓存与24fps门控；减少动态第一次重建后只输出；全聚焦只输出；390×844可绘制；重复dispose资源为0；无控制台错误。

两套脚本保留有意义的截图与JSON报告。`research-scene8.mjs` 使用临时HTTP端口与独立隐藏Chrome，运行后关闭；原工程完全只读。GPU计时与真实低端手机帧率未测量，不能据软件渲染截图声称硬件性能已达60fps。

## 既有镭射资产检索

当前目标根目录起初只有 `source/` 中一个mp4，没有 `package.json` 或应用源码。对幽兰 `src/`、`tests/`、`wiki_memory/` 搜索 `stamp / holo / laser / 镭射 / 邮票`（排除timestamp等误命中）未找到邮票材质或镭射Shader。幽兰场景8为背景光影资产，不能冒称为用户已有邮票Shader。目标工程如何处理缺失镭射源码见总体研究文档。

## 全页浏览器验证脚本

`scripts/verify-browser.mjs` 使用项目 `@playwright/test` 及本机Chrome，连接已运行的Vite服务器（默认 `http://127.0.0.1:4173/`，可用VERIFY_URL覆盖），不另占服务端口。覆盖14项检查：桌面与手机五态截图、6枚鼠标/真实触摸选择、Tab/Enter/Esc及焦点恢复、转场中Esc反向、返回途中改选、10轮材质/纹理UUID与GPU计数稳定、聚焦resize、主容器不滚动且Canvas保持原点、减少动态静止像素/RAF、双dispose清理、真实WebGL context loss、另开禁用WebGL的Chrome验证DOM回退、控制台与页面错误。

中段截图仅在真实转场到阈值后暂时挂起RAF以准确取帧，随后立即恢复；手机hover图明确标注为合成mouse pointerenter，另有真实touch进入/返回和全部6枚触摸检查。触摸点选可见区域中距离遮挡最深处，避免Chrome对紧贴重叠边缘的触点作目标修正；脚本同时记录实际click target以防误报。

输出统一在 `artifacts/verification/`。`npm run test:browser` 为完整验证；`VERIFY_ONLY` 可按检查名称片段跑子集，子集报告使用独立文件名。最终验收以主开发完成全部编辑后生成的 `browser-report.json` 为准，编辑期间HMR可能重置状态、UUID、RAF计数，不能将其与稳定构建的运行结果混用。审计过程中发现的主容器程序滚动、触摸测试点靠近遮挡边缘、HMR重复createRoot等问题均已即时通知主开发。
