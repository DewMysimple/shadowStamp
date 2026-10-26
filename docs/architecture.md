# 工程决策

## 分工

React 负责语义按钮、键盘导航、标签、展览小字、聚焦提示、参数面板和错误回退。原生 Three.js 负责六枚邮票、alpha轮廓阴影、票内斑驳光与静态纸面。一个renderer、一个统一RAF；活动时先计算离屏光场，再输出纸面和透视邮票场景。没有活动交互时停止RAF。未引入R3F、GSAP或状态库，因为单一可逆进度足以描述全部动画。

`src/config.js` 集中六票的桌面/移动坐标、比例、角度、层级、纸色和时长。`src/artwork.js` 首次加载时生成六种独立 CanvasTexture；纹理与材质在 hover、聚焦、返回中复用，绝不重建。`src/rendering/StampMaterial.js` 提供纸面暖光、纸张 alpha 和可控多样本虚化；按用户后续校正移除了彩虹光谱。`src/rendering/DappledLight.js` 原样保留幽兰场景8的光场/散焦核心，按24fps上限离屏更新，最终合成跟随统一聚焦进度。

## 悬停票内的自然光场

用户最新要求光效在悬停票上。因此光学RT与屏幕背景明确分工：场景8光学场保留原始三色以保持50采样的颜色相关权重，但其alpha只供当前邮票材质用自身vUv采样，重映射成暖光与灰棕软影。alpha轮廓裁掉所有票外部分。每枚票独立 `light` 阻尼值控制移入渐显和移出渐隐，没有任何固定自动结束时长。图案随局部坐标移动、旋转、放大，不随屏幕滑动。聚焦后鼠标或手指在票内时仍可引导光照。

本轮面板默认 density26.7、stretch.84、angle44°、softness1.5、speed.35、coverage.708（radius.354）、intensity.55、contrast.18。指针局部UV影响.85，响应.16秒。当前默认以 `src/parameters.js` 为准，覆盖DappledLight独立模块的历史缺省。光色、强度、对比、颗粒、基于真实印刷梯度的压纹/高光同步到邮票材质。没有新增外部纹理。

RT固定384×480、aspect .786，接近六票的共同比例；resize不扩大成屏幕尺寸。`render(time,focus,reducedMotion,lightActive)`只有活动时推进和重算，离开后冻结缓存。背景output只用纸色、静态grain和极弱wash，聚焦时变暗；不存在背景光影模式。减少动态时关闭光场漂移和指针跟随，保留静态照明。

## 坐标

相机以CSS像素为世界单位，原点为视口中心；x向右、y向上。配置为归一化屏幕中心，转换到CSS像素。画面中的Mesh、DOM hit button与标签同源于当前插值姿态。鼠标用raycaster取得动态面片UV并驱动票内光场，因此移动、缩放、旋转后坐标仍正确。DPR限制，resize只更新投影、目标与缓冲区尺寸，不重载材质。聚焦票 `touch-action:none` 防止手机拖动被原生手势接管。

参数迭代将正交相机改为PerspectiveCamera，fov按 `2*atan(视口高/(2*透视距离))` 计算，使正立纸面的CSS像素大小保持不变。画廊1200px到聚焦1400px连续插值；Mesh保持z=0，renderOrder决定纸票叠放。DOM按钮用同一投影/世界矩阵导出的matrix3d，支持倾斜后的投影四角；标签同样使用project(camera)。局部几何偏转直接计算一次阻尼，光照raycast和光斑缓动独立。详情见[参数与差异](parameter-guide.md)。

`overflow:clip`避免聚焦按钮引发浏览器对隐藏溢出容器的程序滚动；这是实际截图调试发现并修复的坐标问题。Shader面片外围有透明gutter，使背景邮票的模糊可向纸边之外延展。标签取动态四角的最高点及票中心作锚点。

## 动画

`idle / hovering / focusing / focused / returning` 为明确阶段。聚焦由一个 [0,1] 连续进度驱动，通过同时插值位置、角度、尺寸、背景、非选中 opacity/blur 与提示实现重叠。约 .46 秒入场，约 .55 秒返回；这接近视频观测约 .43 秒的主要变化区间，保留少量视觉收尾。

切换目标时从当前进度和姿态起算；Escape 在入场中即可反转，快速点击不会同时创建多个动画。返回未完成时重选同票可连续反向，重选别票先回到可切换边界。hover由输入状态持续驱动，不设自动结束定时器。鼠标阻尼采用 dt 指数形式，不依赖刷新率。

## 性能、清理与可访问性

复用纹理、材质、几何和renderer；每帧只更新变换与uniforms，React只在输入阶段改变时更新。票内光场仅活动时以最高24fps重算，画面合成跟随RAF，空闲后停帧；背景保持静态。后台隐藏暂停，减少动画偏好关闭漂移/倾斜并缩短过场。取消RAF、移除事件与observer，释放geometry/material/texture/render targets/renderer，热更新或卸载不会堆积资源。

每枚票是可聚焦的DOM按钮，有可读名称和Enter/Space操作；聚焦时隐藏其他票的键盘目标，Escape/背景/显式关闭按钮可返回，归还原按钮焦点。小屏触摸不依赖hover。无WebGL时提供带原创插画的DOM展示与相同聚焦操作。
