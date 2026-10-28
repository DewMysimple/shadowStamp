# 工程决策

## 分工

React 负责语义按钮、键盘导航、标签、聚焦提示、系列筛选、参数面板和错误回退。原生 Three.js 负责12枚邮票、alpha轮廓阴影、票内光影与静态纸面。一个renderer、一个统一RAF；一个共享光场配合六种可选合成算法，默认新版局部加光；活动时结合独立浅纸纹输出邮票。没有活动交互时停止RAF。未引入R3F、GSAP或状态库，因为单一可逆进度足以描述全部动画。

`src/config.js` 集中三组、12票的桌面/移动坐标、比例、角度、层级与编号。`src/artwork.js`一次解码12张独立地域场景PNG，再按45:65、60:45、40:75生成对应票面Canvas；纹理与材质在hover、聚焦、返回中复用，不重建。`src/rendering/StampMaterial.js`提供邮票局部暖光、纸张alpha和可控多样本虚化；暖色光图经所选算法作用于交互邮票；默认局部加光，旧版保留原乘算。`src/rendering/DappledLight.js`复用幽兰场景8的光场/散焦核心，按活动邮票自身画幅比例更新光图坐标，按24fps上限离屏更新；桌面纸色单独静态输出。

## 悬停票内的自然光场

光学RT与屏幕背景明确分工：沿用本地参考的形态算法，并据原站NCS公开代码保留珊瑚/橙/苔绿光图RGB与alpha。原站公开参数及原始multiply关系继续记录于源码审计；当前默认在亮区局部加光；旧版保留RGB乘算，四种新增算法提供不同明暗曲线。所有算法只绘于交互邮票，不向桌面背景绘制动态贴图。旧版保留aspect .786，其余算法按活动票面画幅适配。alpha齿孔裁掉票外部分。每枚票独立 `light` 阻尼值控制渐入/渐出，没有固定自动结束时长。

`StampMaterial.paperLight()` 同时使用光图和独立纸纹法线，另有浅暖主灯与独立橙暖点灯。`ncsLighting.js`集中经公开代码与GPU核实的灯色、1.6/.65强度、.45灯高及.62粗糙度/.55涂层等参数；光源颜色从sRGB转线性RGB，光图在显示色域合成。印刷图稿由独立Canvas提供，不从图像或文字提取高度、不位移几何、不金属化。`SurfaceTexture.js` 用多尺度域扭曲噪声生成浅纸纤维，纸纹UV缩放独立于光纹尺度。两张不同种子的法线预创建，材质dispose同时释放；切换不重新生成。该适配器没有原站完整RoomEnvironment/Neutral输出链，不把相同参数值冒充完全相同的物理渲染。

唯一光场默认scale1、stretch.84、angle44°、softness1.35、speed.35、coverage.708（radius.354）。Voronoi坐标密度为`26.7/(scale*sizeNorm)`，26.7是原站.534×50；sizeNorm按实际票面与min(DPR,2)半分辨率高度计算。固定RT仍384×480；悬停/聚焦变化只改uniform，不重分配纹理。Voronoi晶格中心固定.5，底层椭圆跟指针。默认1.35为产品额外柔化，原站bokeh参数.754没有半径乘法作用。周围投影独立持久alpha纹理与24采样shader，颜色/浓度/柔化直接更新uniform。

RT固定384×480；动态`aspect`随当前票面比例同步（竖版、横版和超长竖版分别核对），resize不扩大成屏幕尺寸。`render(time,focus,reducedMotion,lightActive)`只有活动时推进和重算，离开后冻结缓存。背景output只用纸色、静态grain和极弱wash，聚焦时变暗；不存在背景光影模式。减少动态时关闭光场漂移和指针跟随，保留静态照明。

`lightPresets.js`注册六套预设；lightAlgorithm白名单枚举经参数面板与存储传入GPU uniform，切换不重建材质。没有旧银面lightModel模式。光影关闭、强度0或无交互票时不执行光场pass；暂停流动且指针收敛后同样停帧。参数v2、appearanceRevision4，兼容导入v1/v2：appearanceRevision小于4的旧材质设置首次迁移为新版默认，保留布局/交互；当前revision保留算法、手调与主动关闭，缺少算法时补local-add。详见[参数说明](parameter-guide.md)。

## 坐标

相机以CSS像素为世界单位，原点为视口中心；x向右、y向上。配置为归一化屏幕中心，转换到CSS像素。画面中的Mesh、DOM hit button与标签同源于当前插值姿态。鼠标用raycaster取得动态面片UV并驱动票内光场，因此移动、缩放、旋转后坐标仍正确。DPR限制，resize只更新投影、目标与缓冲区尺寸，不重载材质。聚焦票 `touch-action:none` 防止手机拖动被原生手势接管。

参数迭代将正交相机改为PerspectiveCamera，fov按 `2*atan(视口高/(2*透视距离))` 计算，使正立纸面的CSS像素大小保持不变。画廊1200px到聚焦1400px连续插值；Mesh保持z=0，renderOrder决定纸票叠放。DOM按钮用同一投影/世界矩阵导出的matrix3d，支持倾斜后的投影四角；标签同样使用project(camera)。局部几何偏转直接计算一次阻尼，光照raycast和光斑缓动独立。详情见[参数与差异](parameter-guide.md)。

`overflow:clip`避免聚焦按钮引发浏览器对隐藏溢出容器的程序滚动；这是实际截图调试发现并修复的坐标问题。Shader面片外围有透明gutter，使背景邮票的模糊可向纸边之外延展。标签取动态四角的最高点及票中心作锚点。

## 动画

`idle / hovering / focusing / focused / returning` 为明确阶段。聚焦由一个 [0,1] 连续进度驱动，通过同时插值位置、角度、尺寸、背景、非选中 opacity/blur 与提示实现重叠。约 .46 秒入场，约 .55 秒返回；这接近视频观测约 .43 秒的主要变化区间，保留少量视觉收尾。

切换目标时从当前进度和姿态起算；Escape 在入场中即可反转，快速点击不会同时创建多个动画。返回未完成时重选同票可连续反向，重选别票先回到可切换边界。hover由输入状态持续驱动，不设自动结束定时器。鼠标阻尼采用 dt 指数形式，不依赖刷新率。

## 性能、清理与可访问性

复用纹理、材质、几何和renderer；每帧只更新变换与uniforms，React只在输入阶段改变时更新。票内光场仅活动时以最高24fps重算，画面合成跟随RAF，空闲后停帧；背景保持静态。后台隐藏暂停，减少动画偏好关闭漂移/倾斜并缩短过场。取消RAF、移除事件与observer，释放geometry/material/texture/render targets/renderer，热更新或卸载不会堆积资源。

每枚票是可聚焦的DOM按钮，有可读名称和Enter/Space操作；聚焦时隐藏其他票的键盘目标，Escape/背景/显式关闭按钮可返回，归还原按钮焦点。小屏触摸不依赖hover。顶部系列筛选在三个系列之间切换；无WebGL时提供带12张地域票面的DOM展示与相同聚焦操作。

## 地域狮舞图稿

2026-10-28用户新增需求以12个地域场景替换旧八态图稿：广东、中国、世界各4张，比例分别为45:65、60:45、40:75。App等待`prepareStampArtwork()`后建立gallery，使用最新参数；异步完成前卸载有取消保护。静态回退复用同一票面生成函数与config布局。当前12票每票有印刷图、两张纸纹法线与一张阴影持久纹理，另有两张共享光场纹理；旧八态图稿记录见[region-stamps.md](region-stamps.md)与[lion-stamps.md](lion-stamps.md)。

## 快速切换时序

2026-10-27修复：照明不再被`uBlur < .02`挡住，新票的光影渐入与图稿回清晰并行。活动ID变化时`setActiveStamp()`标记光场dirty，新票局部目标UV在当帧接管共享缓存，不跨票继承缓动或等待流动节流；票内后续移动保留原response。持续流动的24fps预算不变，切卡/参数输入允许首帧立即刷新。纹理和材质复用，细节与实际证据见[rapid-hover.md](rapid-hover.md)。
