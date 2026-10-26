# 公开参考网站实测

研究日期：2026-10-26。工具：本机 Chrome + Playwright、1440×900 与 390×844 CSS 像素、公开 DOM / computed style / CSSOM，以及只读 WebGL API 观测。没有解包或反混淆生产 JS，也没有将第三方图片、字体或 Shader 复制进成品。

## A. [Bill Guo](https://billguo.me/)

### 当前可确认的画面

- 网站能由真实 Chrome 访问；文本 web 工具访问失败不等于网站不可达。
- 首页有六张邮票，NCS / Kensho / Specimen 为中部偏右的一组叠放；另外三张在右下。角度与图层独立，不是普通卡片网格。
- “View all stamps”按钮打开专门的 Stamps 视图：当前版本将六张邮票排成一条带不同角度的水平散列，中心约 y=450。顺序为 Specimen / Kensho / Lunar Gala / NCS / Gao Han / Motion。并非任务视频中的五张自由构图，成品应优先视频。
- NCS 绿色纸面、很细的纹理与小字；Kensho 黑白排版；Specimen 单色照片；Lunar Gala 深色照片；Gao Han 汉字与轮廓插画；Motion 青绿色图像。每张图案确实不同。
- 轮廓为透明背景图片的真实齿孔，内区没有穿孔。两层 CSS drop-shadow 跟随 alpha 轮廓。
- 页面暖白变量为 `#fffbf4`；背景是基色、低透明度纸面纹理、表面纹理、SVG feTurbulence 颗粒的多层叠加。颗粒有缓慢漂移，并非白色实心矩形。

截图：[首页](reference/web/bill-initial.png)、[Stamps 展开](reference/web/bill-gallery.png)。

### Hover：实测而非推测

| 项目 | 结果 |
| --- | --- |
| 当前邮票 | 提到 z-index 50，paper 缩放到 1.05，rotateX / rotateY 随鼠标位置变化 |
| 其他邮票 | wrapper `blur(4px)`，160ms，opacity 保持 1；视觉存在感主要通过模糊降低 |
| 平滑程度 | wrapper 本身还有持续微小位移和角度漂移；Playwright 默认等待 stable 会超时，需强制移动指针 |
| 标签 | `NEW CRAFT SOCIETY`，在邮票上方，位置随对象屏幕坐标更新，而非固定于视口 |
| 字体 | Departure Mono / monospace，12px，16.8px 行高，uppercase |
| 标签样式 | 4px 12px padding，999px 圆角，`#221911` 背景、暖白文字，双层轻阴影 |
| 标签动画 | opacity 0→1、scale .94→1、少量竖向位移，240ms，`cubic-bezier(.2,.6,.2,1)` |
| 退出 hover | 模糊、scale、tilt、标签自然恢复；没有观察到固定计时后自动结束 |

截图：[NCS Hover](reference/web/bill-hover.png)。原始测量保存在 [bill-interaction-measurements.json](reference/web/bill-interaction-measurements.json)。

### 点击详情：确认范围与限制

点击 NCS 后，当前站点创建固定详情层，背景从暖白过渡到深暖黑 `#16140f`；DOM 原邮票被设为 `visibility:hidden`，详情卡片扶正并位于视口中央。详情层有 `role=dialog` / `aria-modal=true`，背景 cursor 为 zoom-out。

CSS 可确认背景 opacity 转场为 400ms，与物体 transform 转场重叠。1440×900 下中心卡片测得 431.22×540px，x≈499.39、y=180，详情层宽1430px（页面保留滚动条）。尺寸规则为 `min(64svh,540px,(100vw - 48px)*556/444)`，比例444:556。相较画廊未旋转的190px宽约放大2.27倍。

另用 rAF 连续记录实际详情几何，点击事件作为 t=0，得到下表。它确认运动、放大、旋转与背景变化同时发生；数值仅代表本次浏览器采样，最早可用帧为70ms，不能当成精确到毫秒的设计规范。

| 点击后实测时间 | 卡片包围盒 x/y，宽×高（px） | 背景暗层 opacity | 运动状态 |
| --- | --- | --- | --- |
| 70ms | 731.6 / 319.6，211.5×254.8 | 0 | 接近画廊原位置，仍约+5.4° |
| 202ms | 539.3 / 203.6，395.7×491.8 | .764 | 位置、角度、尺寸同时接近目标 |
| 340ms | 499.3 / 179.9，431.4×540.2 | .965 | 首次接近中心正立 |
| 421ms | 496.4 / 178.1，434.5×543.8 | .994 | scale≈1.0062 的极轻微过冲 |
| 479ms | 497.1 / 178.5，433.8×543.0 | 1 | 背景完成，物体继续收敛 |
| 701ms | 499.4 / 180，431.2×540 | 1 | transform变为identity，落定 |

连续数据：[bill-focus-trace.json](reference/web/bill-focus-trace.json)。

**重要环境/当前站点限制：**本次重复访问中，详情图片 `currentSrc` 为空、`naturalWidth=0`，relief canvas opacity=0，故暗色截图未显示出邮票图案。未捕获 pageerror / console error。可以确认详情 DOM 位置与暗场转场，但不能声称从实际画面确认了其最终材质与镭射连续性。截图如实保留，不把空白卡片解释为设计目标。

当前站底部显示 `VIEW CASE STUDY →`，而任务要求和视频为 `CLICK ANYWHERE OR PRESS ESC.`。该差异应以视频为准。Escape 可关闭详情并返回 Stamps 画面；[返回截图](reference/web/bill-return.png)。更细的 DOM 证据见 [bill-focus-probe.json](reference/web/bill-focus-probe.json)。

### 390×844 响应式

当前网站在1023px以下隐藏 “View all stamps”入口和底部返回按钮；首页邮票改为扇形叠放，NCS倾斜到约-74°、Kensho约-56°，并有移动端独立图层顺序。邮票宽度39.5%相对于其扇形 frame，而不是整个桌面排布等比硬缩。真实画面见 [手机首页](reference/web/bill-mobile-initial.png)。任务成品是独立展览，可保留更易点选的自由构图及明确返回按钮，不需复制原站个人主页内容。

## B. [Microsoft AI](https://microsoft.ai/)

### 实际画面与动态

拒绝可选 cookies 后，首页背景可看到上方偏右的斜向有机软光斑，底色为桃粉/暖灰。光斑是连贯的羽化形状，边缘具有低强度细颗粒；明暗区域互相交错，有不规则长形叶影感，整体非标准圆形叠加。下左侧更安静，文字可读性保持稳定。

以约5.1秒为间隔采集三张实际渲染截图，形状位置缓慢漂移和变形；没有观察到闪烁或随机亮度跳变。10秒观察不足以证明不存在长周期重复，因此不对“完全无周期”作结论。移动鼠标后的截图有保留，但不能仅凭相隔时间的截图分离时间变化与指针影响。

截图：[t0](reference/web/microsoft-light-0.png)、[t+5秒](reference/web/microsoft-light-1.png)、[t+10秒](reference/web/microsoft-light-2.png)、[鼠标移动后](reference/web/microsoft-light-pointer.png)。最初一次普通 Chrome 截图只有平色；显式启用 WebGL / SwiftShader 后取得了稳定的真实光影，因此不能把首张平色当成最终设计。

### 运行时技术证据

在页面初始化之前对 canvas.getContext 与 WebGL shaderSource / getUniformLocation 作只读记录，得到如下证据；这是编译到浏览器中的实际 Shader 文本和 API 记录，不是因页面引用了某个库而猜测机制。

| 层次 | 可确认的机制 |
| --- | --- |
| 容器 | 自定义 `block-gl` 元素内 WebGL2 canvas，pointer-events none，sticky，带 pause-on-scroll 标记 |
| 分辨率 | CSS 1440×900，drawing buffer 720×450，即半尺寸渲染后放大 |
| 背景 | 背景颜色与一张背景纹理经 overlay 混合 |
| 基础形态 | 具有 radius / falloff / skew / angle / position 的椭圆 vignette，与 smoothstep 羽化 |
| 波形位移 | uTime 驱动的正弦 UV 扭曲，frequency / amplitude / rotation 可调 |
| 有机变形 | 动画 Voronoi 最近单元点驱动的 UV 偏移，3×3相邻单元搜索；不同 cell 的初相位不同 |
| 柔焦 | 黄金角螺旋50采样 bokeh，加 blue-noise 纹理对采样方向作微扰 |
| 合成 | 多 pass 输入纹理叠加，最终与背景相乘并以低权重混合，另有曝光/色调映射/伽马处理 |
| 鼠标能力 | Shader 中存在 uMousePos / uTrackMouse，但“能力存在”不能证明当前各 pass 开启了追踪 |
| 外部纹理 | 观察到背景 sampler 与 blue-noise sampler，资源请求含 `LDR_RG01_0-…png` |

因此，这一版本并不是仅靠 CSS radial-gradient，也不能简单称为 Perlin Noise。WebGL2 可确认；是否内部使用 Three.js 无法从以上 API 记录独立确认。

此原站链路包含较重的50次采样与多 pass；邮票展览的背景应采用更克制强度。适合从本地场景8保留相应形态算法，再在已有渲染循环里组织成一次低分辨率背景 pass，避免整套复制。羽化、漂移速度、色温、覆盖方向比复制库名称更影响观感。

## 可直接指导本工程的决策

1. 自由布局与聚焦目标以本地视频为主，当前原站只辅助确认交互层次及标签细节。
2. hover不应降低当前对象清晰度；其他对象主要通过渐变模糊退后。
3. 邮票轮廓与投影保持同一 alpha，标签锚定邮票世界/屏幕坐标。
4. 光影应是背景氛围：大尺寸有机形状、低对比羽化、慢时间变量；不增加粒子或明显霓虹。
5. 成品的中心邮票必须保持同一对象/材质连续，避免当前原站观测中图片交接失败一类问题。
