# 相框、三维文字与地域邮票交付

> 本页记录4994b1d的原资产与分类整合。2026-10-29后续已完成内框稳定性、整框微旋转、左上模型控件及原blend三圆盘布光；当前代码、默认值与新验收以[相框摄影棚说明](frame-studio.md)为准。下述矩形光源/VSM与0.2 HDRI是已被替代的上一轮实现，不作为当前参数。

本轮修改桌面工程的地域新版，入口仍为 runGo.cmd（http://127.0.0.1:4174/）。原版 runStart/4173 的运行文件及启动方式保留。用户后续明确指定桌面优先、不考虑手机优化，并以标注图将相框扩大到主要展示区域；此选择替代任务书最初的等宽建议。

## 实际布局与资产

1440×900 下相框本体约844×422 px，保持原模型2:1比例；左侧逻辑视口占61.5%，右侧展示区占33%。右侧四枚邮票放在两行两列中，展示高度与相框对应。广东默认开启；中国和世界各有4枚既有邮票。删除重复的顶部分类按钮，参数控件默认收起。

使用用户原始 ArtFrame_2to1.glb，其复制文件与源文件SHA256完全一致。宽1000、高500、厚30 mm，原木框、米白画芯、风景照片、装饰线、UV及PBR贴图均保留。旧的4个 Text_*_Mesh 独立对象仅在网页中隐藏；未修补照片、未覆画芯，也未写入原Modeling工程。原12枚邮票PNG及邮票光影着色器不改。

| 资产 | 桌面工程内实际路径 |
| --- | --- |
| 可编辑工程 | editions/regional/assets/blender/FrameTypography.blend |
| 原相框完整复制 | editions/regional/public/models/art-frame-original.glb |
| 五组文字网格 | editions/regional/public/models/frame-typography.glb |
| 指定HDRI复制 | editions/regional/public/environments/citrus-orchard-road-4k.exr |
| 原Blender显示变换 | editions/regional/public/textures/frame-agx-medium-high-lut.png |
| 模型重建脚本 | editions/regional/scripts/build-frame-typography.py |
| 显示变换重建脚本 | editions/regional/scripts/build-frame-display-lut.py |

实际Blender为 F:/Blender/blender.exe，版本5.0.0；没有使用 launcher 代替后台可执行程序，没有安装Blender。新工程包含5个可编辑FONT对象，中文用本机SimHei，英文用Arial，字体已打包；29个所需字符经几何检查，系统字体cmap检查无缺字。HDRI在新blend中相对链接至同工程public文件，重新打开验证存在。

新文字对象与GLB节点名称为 Title_Chinese、Title_English、Category_Guangdong、Category_China、Category_World。正文分别为“狮行万里·从岭南到世界”、“FROM LINGNAN TO THE WORLD”、“广东”、“中国”、“世界”。分类字形约18.24 mm高、1.44 mm总厚度，接近原模型下方英文标题的尺度，已较首轮44 mm字形明显缩小；标题与副标题分别约10.58、6.58 mm高。新字网格与原相框共用米制原点：Blender X向右、Z向上、正面-Y，标准glTF Y向上、正面+Z。网页只对共同父组施加极小的展示角度，未单独猜测文字偏移。

## 交互与实现文件

- App.jsx：集中管理当前地域，默认广东；同步标题、04/12数量、无障碍按钮和邮票详情。画面中的交互入口为相框文字，无重复分类导航。
- config.js：统一计算左相框、右邮票标题及四格布局，所有邮票保留原比率。
- rendering/StampGallery.js：保留唯一Renderer、RAF、邮票材质与聚焦时间线；加入相框视口、分类序列和生命周期。
- rendering/ArtFrame.js：加载相框和文字、构造每组文字独立命中体，使用真实Raycaster判断地域；图片区域和整框不作为分类按钮。
- rendering/FrameStudio.js：使用EXRLoader、PMREM及三个面光源建立相框照明。
- rendering/FrameDisplay.js：只对相框PBR输出使用原Blender显示LUT，不改变邮票Shader。
- styles.css、ParameterPanel.jsx：排版、辅助信息、键盘入口和默认收起面板。

每个词有独立枢轴与材质。进入时依次显现，悬停沿共同正面法线前移最多4 mm，缩放最高1.035；指数响应时间常数0.075 s，约225 ms达到95%，选中维持较小的前移与陶土色。没有金属、发光和持续漂浮。键盘Tab可到达对应语义按钮，左右/Home/End移动焦点、Enter选择，并由真实三维文字显示焦点状态。减少动态时直接到达状态并停止连续帧。

点击通过同一分类状态使旧组在0.13 s内退出；新组从0.14 s后显现，四枚间隔0.035 s。快速切换从当前透明度重定向，最后一次选择生效。邮票悬停暖光、聚焦、详情、Escape、六种算法及参数导入导出均保留。分类切换不重载模型、HDRI和图片，不重建Renderer。卸载释放几何、材质、贴图、ImageBitmap、PMREM、阴影贴图及事件；HDRI/模型失败时有可操作的分类回退。

## Three.js官方研究与渲染差异

研究以本机three 0.185.1代码和官方资料为依据：

- [色彩管理](https://threejs.org/manual/pages/color-management.html)：PBR颜色贴图为sRGB，法线/粗糙度为数据，照明在线性空间完成，最终输出只转换一次。
- [EXRLoader](https://threejs.org/docs/pages/EXRLoader.html)及[PMREMGenerator](https://threejs.org/docs/pages/PMREMGenerator.html)：用HalfFloat读取用户4096×2048 EXR，在线性空间预过滤成物理材质的环境光。
- [Scene.environment](https://threejs.org/docs/pages/Scene.html)：HDRI只赋给相框Scene.environment，不设为页面背景，不赋给邮票场景。
- [RectAreaLight](https://threejs.org/docs/pages/RectAreaLight.html)：以源Blender三盏柔光箱的位置/颜色/面积重建局部柔光。Three只支持矩形且不直接投影，因此采用等面积矩形近似原圆盘，接触投影独立使用VSM。
- [LightShadow](https://threejs.org/docs/pages/LightShadow.html)：VSM模糊与阴影采样，并增加视口外扩，避免投影被矩形边界裁切。
- [Renderer色调映射](https://threejs.org/docs/pages/WebGLRenderer.html)、[LUT](https://threejs.org/docs/pages/LUTPass.html)、[Material扩展](https://threejs.org/docs/pages/Material.html)：本机Three AgX代码未包含Blender的Medium High Contrast外观，故从源blend烘焙64³对数LUT，保留AgX、该Look和0.4曝光，通过相框材质输出钩子采样；数据纹理不再做第二次sRGB转换。没有改原贴图RGB。

同一Blender摄影棚分别渲染原生材质和原GLB，确认纹理与材质导出完整（证据两张blender-*.png）。网页首轮的问题是强直射/暖色半球光、缺环境反射、显示曲线不匹配，并且透明命中辅助面意外投影。当前保留原贴图，通过用户指定HDRI、源柔光箱、源显示曲线、柔和接触影修正；透明命中面不参与阴影。

当前HDRI强度0.2、旋转约63°；三个面光源位置由源坐标变换得到。相框渲染之后恢复Renderer状态，邮票原Shader输出不受曝光或LUT影响。网页与Cycles仍有矩形光源近似、实时阴影和路径追踪GI的技术差别，不宣称像素完全一致。

## 实际验证

- 新版 npm test：21项通过；npm run build通过。
- 原版根 npm test：19项通过；npm run build通过，原运行文件及12张新版图稿校验保全。
- node editions/regional/scripts/verify-art-frame.mjs：19项桌面验收通过。
- 新版 VERIFY_OUTPUT=artifacts/art-frame/preset-regression node scripts/verify-light-presets.mjs：8项通过，覆盖六个GPU分支、竖/横票面差异、关光后RGB一致、桌面背景静态、参数导入导出/重载及资源稳定。
- 实际运行runGo.cmd复用正确4174服务；未改启动器、package或锁文件。
- Blender重新打开新工程，确认5个可编辑文字、打包字体、HDRI相对路径有效。
- 桌面尺寸1024×768、1280×720、1440×900、1920×1080、2560×1440：相框完整、比率正确、邮票无重叠/越界；另验1536×864 CSS视口、DPR1.25（1920×1080物理像素）的桌面密度适配，截图08与desktop-density-125.json保留真实结果。
- 三组真实悬停与点击、逐帧错峰过渡、快速连续点击、键盘、聚焦/返回、模型错误回退、重复切换不重载资源、空闲停帧及卸载清理通过。浏览器无新增错误。
- 记录到ANGLE对约1e-17常数折叠的一类X4122精度提示，完整原文保留preset报告；未发生着色器编译失败。验收仅容许此明确亚精度提示，其他诊断仍失败。
- 用户明确排除手机端优化，本轮桌面验收不代表手机性能或移动布局交付。首载保留70.7 MB源EXR和45.7 MB完整相框GLB，未针对公网传输压缩或部署。

当前报告和实际截图位于 editions/regional/artifacts/art-frame/：report.json、model-build.json、editable-verification.json、asset-preservation.json、display-transform.json、runtime-diagnostics.json；01-initial-guangdong.png、02-hover-china.png、03-selected-china.png、04-selected-world.png、05-stamp-focus.png、06-desktop-1920.png、07-frame-closeup.png均为真实浏览器截图。旧画廊UI验证报告仍作为历史保留，不把旧快照等同本次界面验收。

本轮仅本地提交，未推送或部署；用户未跟踪prompt/和source/Picture_01/保持未暂存。
