# 四段录屏对比：悬停、聚焦与参数调整依据

2026-10-26。用户随后明确给出的`C:\Users\Administrator\Desktop\1.mp4`至`4.mp4`均已读取。最初尚无路径时的“输入缺失”结论已被这次实际文件核验取代。四个原文件只读，SHA256、流元数据、逐帧几何记录在[输入审计](../artifacts/controls-research/video-input-audit.json)。

## 视频与查看范围

| 顺序 / 用户指定含义 | 分辨率 | 视频流时长 / 帧数 | 容器时长 | SHA256前12位 |
|---|---|---|---|---|
| 1.mp4：原站悬停 | 446×534 | 6.125秒 / 147帧 | 6.130秒 | d323032107fc |
| 2.mp4：改动前版本悬停 | 430×514 | 4.500秒 / 108帧 | 4.504秒 | 3d4d9ba7451b |
| 3.mp4：原站聚焦之后 | 898×1022 | 6.042秒 / 145帧 | 6.042秒 | bec012180dd9 |
| 4.mp4：改动前版本聚焦之后 | 902×1036 | 4.708秒 / 113帧 | 4.760秒 | 29f8497537d2 |

全部为H.264、24fps。使用本机ffprobe与OpenCV重新测量，共解码**513帧**，生成并实际查看了14张覆盖全部连续帧的联系表；另有4张每4帧概览以及原分辨率关键帧。复现命令：`python scripts/analyze-controls-videos.py`，不修改输入。

- [1：原站悬停概览](../artifacts/controls-research/video-1-original-hover-overview.jpg)，连续帧：[0–47](../artifacts/controls-research/video-1-original-hover-frames-000-047.jpg)、[48–95](../artifacts/controls-research/video-1-original-hover-frames-048-095.jpg)、[96–143](../artifacts/controls-research/video-1-original-hover-frames-096-143.jpg)、[144–146](../artifacts/controls-research/video-1-original-hover-frames-144-146.jpg)。
- [2：旧版悬停概览](../artifacts/controls-research/video-2-previous-hover-overview.jpg)，连续帧：[0–47](../artifacts/controls-research/video-2-previous-hover-frames-000-047.jpg)、[48–95](../artifacts/controls-research/video-2-previous-hover-frames-048-095.jpg)、[96–107](../artifacts/controls-research/video-2-previous-hover-frames-096-107.jpg)。
- [3：原站聚焦概览](../artifacts/controls-research/video-3-original-focus-overview.jpg)，连续帧：[0–47](../artifacts/controls-research/video-3-original-focus-frames-000-047.jpg)、[48–95](../artifacts/controls-research/video-3-original-focus-frames-048-095.jpg)、[96–143](../artifacts/controls-research/video-3-original-focus-frames-096-143.jpg)、[144](../artifacts/controls-research/video-3-original-focus-frames-144-144.jpg)。
- [4：旧版聚焦概览](../artifacts/controls-research/video-4-previous-focus-overview.jpg)，连续帧：[0–47](../artifacts/controls-research/video-4-previous-focus-frames-000-047.jpg)、[48–95](../artifacts/controls-research/video-4-previous-focus-frames-048-095.jpg)、[96–112](../artifacts/controls-research/video-4-previous-focus-frames-096-112.jpg)。

录屏是不同尺寸的局部裁切，鼠标轨迹和速度也不同。因此不将两个视频的同一秒当成同一动作，不用裁切图中的票高占比推导全屏聚焦尺寸，也不给出失真的逐像素还原分数。

## 悬停：不只是同一个光场的强度不同

原站1.mp4：初态票面较柔和，进入后防伪细线、细颗粒和像纸面压纹的明暗显著增强。反射带以浅黄、淡桃粉、灰绿构成，变化分布在纸边和细密纹理中，主要图案仍可读；左侧其他邮票失焦。指针移动同时带动轻微空间姿态变化。

旧版2.mp4：进入后出现大块深绿斜向阴影和亮黄光带，明暗宽度远大于原站细纹。几条宽斜带在票面推进，比原站更像外部树影投在纸上；局部最暗处会压低原图对比，白色纸边也明显变灰。票面自带的等高线和岛形分布也不同。

| 观察事件 | 原站1.mp4实际可见帧 | 旧版2.mp4实际可见帧 |
|---|---|---|
| 标签/背景票虚化开始 | 49帧，2.042秒 | 20帧，0.833秒 |
| 票面效果建立 | 51–54帧，2.125–2.250秒有明显纹理过渡；约55帧2.292秒进入连续反射 | 20–26帧，0.833–1.083秒逐渐加强宽光带 |
| 持续票内移动 | 55–117帧，细纹和边缘暖色随指针变化 | 26–66帧，宽斜影变化持续，几何方向感弱 |
| 移出与恢复 | 118帧4.917秒票面基本切回初态，标签继续收拢、其他票逐步恢复 | 67帧2.792秒标签收拢，票面光场淡出，约75帧3.125秒基本恢复 |

时间来自24fps实际画面，单帧间隔41.7毫秒；这是首个可见变化，不能假装是精确pointerenter日志。原站建立过程约0.25秒，旧版约0.25秒，**时长并非最大的差异**。主要差异是光影尺度、亮暗分配、印刷/压纹细节、几何投影及指针映射。

单纯减少动画速度不能把宽树影变为细密表面反射。调低光影强度和暗部权重、提高细节可读性，可减少夸张阴影；原站票面压纹与本工程原创图案仍有结构差异，不能承诺只调参数便逐像素相同。

## 聚焦之后：方向偏转确实缺失了大部分视觉线索

3.mp4从第一帧就已处于聚焦状态；4.mp4同样没有点击进入和返回段。这两段能比较聚焦后的交互，不能用于重新测量进入/退出转场时长。

原站3.mp4中，指针往不同区域移动时，纸张边缘产生小幅梯形透视变化，中心也微移；2秒附近与6秒附近的倾斜方向不同。整个幅度克制，但左右/上下边长会改变。细密纸面明暗和暖色反射在聚焦后持续存在。

旧版4.mp4中，0–17帧几乎静止；约18帧0.750秒指针进入，光带开始建立，约24帧1秒较明显；约102帧4.250秒移出后光效淡出。强烈斜影在动，邮票外轮廓却接近固定矩形，这正是“光在动、纸张没有朝指针微偏转”的观感来源。

### 从实际像素估计几何差异

对两段深背景上的纸张二值分离，取凸包中的长外缘线段，避开齿孔和切角，再求四条直线交点，得到纸张的虚拟外接四角。拟合用于确认方向性和量级，有数像素不确定性，不能当作DOM精确角度或原站参数。全部145/113帧数据在[原站拟合](../artifacts/controls-research/video-3-focused-quad.json)和[旧版拟合](../artifacts/controls-research/video-4-focused-quad.json)；[实际帧叠加图](../artifacts/controls-research/video-focus-geometry-evidence.jpg)可复核是否跟随纸边。

| 几何量（各自视频内全帧范围） | 原站3.mp4 | 旧版4.mp4 |
|---|---|---|
| 顶边宽 / 底边宽 | 约0.964–1.040 | 约1.000 |
| 左边高 / 右边高 | 约0.973–1.022 | 约1.000 |
| 投影中心横向跨度 | 约8.1px | 约0.5px |
| 投影中心纵向跨度 | 约15.2px | 小于0.1px |
| 初帧纸张外接尺寸 | 约646×809px | 约583×741px |

原站上下边宽比存在约±4%的变化，旧版几乎恒等；该差异显著大于拟合误差。中心位移的一部分可来自透视投影本身，录屏不能唯一证明原站另做了平移。

## 为什么旧版已有倾角，视觉上仍像没动

本轮开始时`src/rendering/StampGallery.js`并非完全没有聚焦鼠标响应：`active`在聚焦时等于选中邮票，局部raycast UV会驱动X/Y倾角。但它用`OrthographicCamera`，聚焦中心固定、Z角归零；最大X约±2.86°、Y约±4.01°，UV和倾角各经过0.12秒阻尼。

正立平面在正交相机下，小角度单轴旋转主要使宽或高乘以cos。4.01°只改变约0.245%宽度，2.86°只改变约0.125%高度；左右旋转的cos还相同。缺少透视近大远小，即使提高光场强度，也不会出现原站梯形方向线索。两段串联阻尼又增加响应迟滞；0.12秒是时间常数，并非动画完成时长。

因此本轮应独立开放：画廊倾角、聚焦倾角、透视距离、跟随时间、光影强度/暗部/形态/速度等。聚焦仍须以同一邮票对象连续呈现，调光不能替代几何交互。默认数值还应结合[真实网站复查](controls-web-research.md)来确定，最终改动后画面与专项验证另见本轮交付记录。

这四段录屏同时包含时间和指针变化，不能仅凭它们判断原站光纹是否在指针静止时独立漂移；该问题需要浏览器固定时间或固定指针的独立测量。

## 本轮完成后的三列对照

[原站录屏 / 上一版录屏 / 本轮实际页面对照图](../artifacts/controls-research/video-original-previous-current.jpg)分悬停、聚焦两行。右列使用本轮最终Chrome截图[实际悬停](../artifacts/controls-research/final-gallery-hover.png)与[实际聚焦](../artifacts/controls-research/final-focused.png)，局部光场仍由真实票面UV影响。为了固定比较时间，只暂停了光纹随时间流动，未关闭光影或指针响应。

六张图按**投影后纸张包围盒的相同高度**作均匀缩放与居中，保留原有宽高比和透视角度，未拉伸、扶正或作透视矫正。原站/上一版hover外缘为人工估计（约±5px）；聚焦视频使用长外缘拟合；本轮使用实际GPU投影四角。输入SHA256、裁切依据、统一缩放值及本轮姿态保存于[对照记录](../artifacts/controls-research/video-original-previous-current.json)。复现命令：`python scripts/compare-controls-videos.py`。

本轮图中宽斜影对原图的遮盖已减弱，纸边亮度保留更多，票面细线可见；聚焦右上指针时出现实际梯形透视。该次聚焦捕获的顶/底边宽比约0.976、左/右边高比约1.019，落在原站录屏观察到的量级内。但它只是一个真实姿态，不能拿单帧证明整条鼠标运动轨迹与原站一致。

三列的鼠标路径、时间和原始平面图案不同，本轮也没有复制原站的印刷资源；原站更细密的压纹、边缘暖反射和局部色彩仍有差异。具体调节方法见[参数面板使用说明](parameter-guide.md)。
