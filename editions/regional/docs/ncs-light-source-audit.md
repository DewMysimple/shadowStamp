# NCS橙色光：原站源码与实际参数

核实日期：2026-10-26。这次直接读取 [Bill Guo](https://billguo.me/) 当天公开JS，再用Chrome读取实际GPU uniform、Canvas2D合成和素材请求；不只依据截图猜色。完整第三方bundle仅保存在忽略目录供分析，产品不引用它们。永久证据是[源URL、SHA、字符偏移与短定位片段](../artifacts/ncs-light-source/source-evidence.json)、[公开脚本索引](../artifacts/ncs-light-source/script-index.json)、[根任务GPU记录](../artifacts/ncs-light-source/runtime-ncs.json)和[本次DPR/分辨率/纹理实测](../artifacts/ncs-light-source/resolution-and-assets.json)。

## 橙色来自两层，不能只留alpha

NCS的默认材质由 [配置bundle](https://billguo.me/_next/static/immutable/chunks/09j4kyo_en-y6.js) 字符18287映射到 `impasto-gloss`。其中点光明确为 `#FFE0B0`，主定向光另为 `#FFF4E6`，镜面颜色另为 `#FFF6EA`，不是同一个“暖光颜色”。[页面调用bundle](https://billguo.me/_next/static/immutable/chunks/125leska-e-p9.js) 最后一次 `paintLamp` 赋值为.65，覆盖对象前面的1；稳态实际点灯强度是.65。

另一个关键层是[光场bundle](https://billguo.me/_next/static/immutable/chunks/3w2nom2m9dhx_.js) 的彩色光图：

| 角色 | 源码颜色 | NCS实际选择 |
| --- | --- | --- |
| 首pass透明区RGB | `#FFAAA5`，珊瑚色 | 保留在光场中间层 |
| 最终输出底色 | `#FFD198`，桃橙色 | 亮部与过渡色来源 |
| 阴影 | 引擎兜底 `#4A0035` | NCS `paintHue=2`，覆盖为moss `#4E5C3C` |

光场先生成带alpha的珊瑚/苔绿场，经过正弦、Voronoi与50次颜色加权散焦；最后以桃橙底混合散焦RGB，输出不透明彩色光图。其最后关系为 `mix(peach, blurredRGB, blurredAlpha)`，输出alpha为1。散焦对各RGB通道使用颜色相关权重，alpha则取样点均值，因此最后RGB不能从一个平均alpha和两种票面颜色完整还原。

页面再把这张彩色图用 `destination-in` 裁进邮票alpha，在物理渲染底图上做 **multiply**。默认 `paintHaze=.26`，`paintGlow=0`，所以不是soft-light；揭示转场中合成alpha为 `.26 × lerp(.6,1,reveal)`，稳态为.26。本次真实Canvas2D拦截已记录alpha趋近.26的过程。票面不透明处的稳态等价关系是 `baseRGB × (.74 + .26 × dappleRGB)`。

这纠正了此前只从图片调一个更暖颜色的不足：项目旧路径只采光图alpha，丢掉了桃橙/珊瑚RGB和颜色相关散焦；同时没有独立实现原站橙色点灯。只改滑块颜色不能等价补回这两层。

## NCS稳态材质与灯光

下表是模板经页面参数、`buildPreset`和引擎赋值后的值，不把模板中途的clearcoat .28写成最终值。主任务独立GPU实测与这些稳态值一致；揭示阶段有从磨砂态到成品态的插值，瞬时值可略低或略高。

| 参数 | 最终值 |
| --- | --- |
| color / metalness / roughness | `#FFFFFF` / 0 / .62 |
| clearcoat / clearcoatRoughness | .55 / .20 |
| normalScale / clearcoatNormalScale | (1.6,1.6) / (1.1,1.1) |
| ior / specularIntensity / specularColor | 1.5 / .6 / `#FFF6EA` |
| envMapIntensity / toneMapping / exposure | 1 / Neutral / .57 |
| alphaTest | .5 |
| 原站displacementScale / bias | .09 / −.045；这是研究事实，本项目按用户要求不复制真实位移 |
| 定向光 | `#FFF4E6`，1.6，位置 `normalize(-.3+lx,.45-ly,.4)` |
| 橙色点光 | `#FFE0B0`，.65，位置 `(lx,-ly,.45)`，decay 2 |
| 半球填充 | 天空白、地面 `#9A8F7D`，强度.32 |

[物理引擎bundle](https://billguo.me/_next/static/immutable/chunks/1tsv4_hr1pvu5.js) 确认点灯是独立 `PointLight`。它还含一条可选的彩色光图高光门控路径，但NCS默认 `paintShade=0`，生成的 `dappleCoupling=0`，所以门控分支默认不开。不能把源码中“peach门控”的注释误读成默认橙色来自高光门控。实际默认的彩色光图是页面后续的multiply层。

## 光图尺度、坐标与散焦

页面默认：tint .26、amount 1、scale 1、spread .45、relit 0、hue 2。椭圆光图的指针中心为 `(.5+lx,.5-ly)`；其中lx、ly来自归一化DOM指针减.5，Y在光图中翻转。**Voronoi和正弦pass的uPos另固定为(.5,.5)**，不能因为同名就把晶格中心改成跟随指针。半径为 `.354 × spread/.45`，默认.354；falloff 1、skew .54，平滑内外缘为radius的.25/.75；正弦frequency .35、amplitude 1.18；Voronoi角度.122222圈即44°、skew .84。

正弦pass实际频率为 `.35×20=7`，振幅先乘.2、再从双倍坐标回UV时乘.5，因此1.18对应UV位移幅度.118。Voronoi偏移等价 `(winner-.5)×.4×spread`。原散焦uniform amount .754、tilt .5确实存在，但源码计算的blurRadius没有用于Bokeh偏移；有效盘状采样半径来自 `aspect×.003`，加很小的蓝噪声抖动。原amount只在等于0的分支中改变结果，不能把.754误写成实际半径倍率。若本地保留有效“散焦柔化”滑杆，倍率1对应原有效采样范围，其他倍率属于明确的产品调参。

“纹理放大”不能只理解为固定密度。原站的cellAmount为 `.534 / (max(.2,scale) × clamp(560/光图高度,1,3))`。页面将物理base尺寸设为client尺寸乘 `min(DPR,2)`，光图取base宽高各右移一位。本次1440×900真实测量：

| 状态 | 物理base尺寸 | 光图尺寸 | sizeNorm | GPU cellAmount | 坐标密度50×amount |
| --- | --- | --- | --- | --- | --- |
| DPR1悬停 | 190×238 | 95×119 | 3 | .178 | 8.9 |
| DPR1聚焦 | 431×540 | 215×270 | 560/270 | .2574642857 | 12.8732142857 |
| DPR2悬停 | 380×476 | 190×238 | 560/238 | .22695 | 11.3475 |
| DPR2聚焦 | 862×1080 | 431×540 | 560/540 | .5149285714 | 25.7464285714 |

四种状态的radius均.354、散焦amount均.754；aspect则取各自RT宽高之比，例如DPR1悬停95/119、聚焦215/270。原Voronoi坐标乘50×amount，所以基础26.7是.534×50，真正票面密度应再除scale与sizeNorm；不能额外乘3而错误地放大三倍。固定一张480高光图并始终使用同一密度，会在聚焦中保留错误的尺度关系。若产品为性能使用固定RT，仍应明确如何把显示尺寸与原站cellAmount关系映射进形态，不能把一种固定密度说成所有状态的原值。本项目新字段“光纹放大”对应原站paintScale的反比关系；独立“纸纹放大”只控制浅法线UV，是本地纸纹参数，不能冒充原paintScale。

## 实际贴图角色

网络请求与引擎赋值共同证明如下角色；没有将远端文件下载作为本项目资产。

| 层 | 悬停小图 | 聚焦全图 |
| --- | --- | --- |
| 物理albedo | `/relief/ncs-paint-sm.webp` | `/relief/ncs-paint.webp` |
| normal与clearcoatNormal，同图双用途 | `/relief/ncs-sm.webp` | `/relief/ncs.webp` |
| height | `/relief/ncs-height-sm.webp` | `/relief/ncs-height.webp` |

未交互静态图来自 `/stamps/ncs-384.avif` 等响应式阶梯。此前观察到的 `/relief/coatnormal-sm.webp` 是引擎为acrylic全局预加载，**不等于NCS实际使用的coatNormal**。这次已沿 `finishMaps → ex → render → L.clearcoatNormalMap` 核对，避免把“请求过的资源”误当作当前NCS材质的实际绑定。

本次研究用于恢复正确RGB光场合成、独立橙色点光及尺度关系。原站还使用专用图稿/法线/高度；本项目继续遵守用户保留原界面、只改光、允许浅纸纹、不要浮雕和金属化的边界，不因查到位移参数而引入顶点位移，也不新增模式或预设。最终实现与验收应另核对当前源码和真实画面，本页源码事实不代替产品完成证明。
