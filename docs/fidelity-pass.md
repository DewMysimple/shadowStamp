# 波纹来源与最新两段录屏复查

核实日期：2026-10-26。本页记录本轮修改前基线 `2345174` 的问题、最新输入及真实网站观测；本轮实现和验收结果由对应交付记录补充，不用旧测试替代新状态。

**最新用户选择优先：保留原界面和印刷纸面，只修改光；允许微细压纹，不要浮雕和金属化。** 因此原站Kensho黑银浮雕仅是研究事实，不再是本项目要复制的外观。下文的材质观测继续保留，末尾的银面试验明确为已被替代的中途探索，不能作为最终交付目标。

## 图片中为什么会有波纹

这是此前实现自行加入的静态图稿，不是用户要求，也不是必须存在的光照。基线 `src/artwork.js` 的 `craft()` 无条件调用 `engravedContours()`：用正弦/余弦解析场作 marching squares，绘制74级等高线，每5级加深；随后再叠加170排正弦横线。线密度在某些区域聚集，缩小显示时形成宽的明暗弯带，看起来像波纹或折皱。

这些线在创建 CanvasTexture 时已经烘焙到印刷底图。即使未悬停、材质 `uActivity=0`、关闭动态光影，波纹仍存在。因此“只把光影强度调小”不能把图片中的静态波纹去掉。`lightWarp` 调节的是另外一层场景8光域UV扭曲，也不控制这张静态图。

原站确实有细密表面纹理，但它另有高度/法线资源，在hover时产生显著反射，不能据此把粗等高明暗线永久画进绿色基图。本轮应分别处理静态印刷与动态表面，去掉错误烘焙的粗波纹，不应把它包装成对原站的准确还原。

## 最新 1.mp4 与 2.mp4 不是上一轮相同输入

[本轮输入元数据](../artifacts/fidelity-research/latest-video-inputs.json)由 `python scripts/analyze-fidelity-videos.py` 重新读取。原视频只读，分析前后SHA256一致。共解码281帧，生成并实际查看7张覆盖全部连续帧的联系表。

| 输入 | 实测 | 本轮内容 |
| --- | --- | --- |
| 桌面1.mp4 | 446×534，24fps，147帧，视频6.125秒；SHA256 `d323032107fc…` | 原站绿色NCS悬停，与此前1.mp4一致 |
| 桌面2.mp4 | 546×538，24fps，134帧，视频5.583秒；SHA256 `e78e78bbe8e0…` | 最新本地黑白Kensho悬停，NCS只在右缘局部出现；已替换前轮430×514的旧2.mp4 |

- 原站：[概览](../artifacts/fidelity-research/1-original-hover-overview.jpg)，连续帧[000–047](../artifacts/fidelity-research/1-original-hover-frames-000-047.jpg)、[048–095](../artifacts/fidelity-research/1-original-hover-frames-048-095.jpg)、[096–143](../artifacts/fidelity-research/1-original-hover-frames-096-143.jpg)、[144–146](../artifacts/fidelity-research/1-original-hover-frames-144-146.jpg)。
- 最新本地：[概览](../artifacts/fidelity-research/2-latest-current-hover-overview.jpg)，连续帧[000–047](../artifacts/fidelity-research/2-latest-current-hover-frames-000-047.jpg)、[048–095](../artifacts/fidelity-research/2-latest-current-hover-frames-048-095.jpg)、[096–133](../artifacts/fidelity-research/2-latest-current-hover-frames-096-133.jpg)。

1.mp4在49帧约2.042秒出现标签，51–55帧有表面建立过程；此后浅暖光和细密压印随指针改变，118帧约4.917秒恢复基图。2.mp4在27–28帧约1.125–1.167秒开始悬停，纸张被宽灰棕明暗块覆盖；约116–120帧4.833–5秒逐步移出恢复。它能确认当前通用乘影使黑白票泛灰，却不能证明两张不同邮票的图案、同一秒或同一指针方向应逐像素相等。

原始 `source/` 外部参考视频仍用于自由构图和NCS交互目标，已有[286帧分析](video-analysis.md)。本轮重新核对SHA256 `d96132ce5359963e783924cca2854286c831e6d08bb908ed8216c0b36845843c`、2912×1952、286帧、视频5.255秒与平均帧率57200/1051，和旧分析输入一致；另实际查看第0帧初态、第100帧悬停及第220帧聚焦，细密反射与本轮1.mp4/网页目标一致。[身份与抽查记录](../artifacts/fidelity-research/external-source-audit.json)、[悬停局部](../artifacts/fidelity-research/external-source-hover-crop.jpg)。因此复用旧连续286帧时间表，不无谓重做全片。这份旧分析与本轮281帧复查分开保存；两类视频的裁切、时长、帧率不能混用。

## 原站：基图、独立高度和每枚票的材质

使用本机Chrome / Playwright，1440×900，实际进入 [Bill Guo](https://billguo.me/) 的Stamps区域，对NCS与Kensho分别做中心、右上、左下悬停以及点击聚焦。复现脚本为 `node scripts/research-fidelity-web.mjs` 与 `node scripts/research-fidelity-web.mjs --kensho`。均成功取得详情图，不使用旧轮图片未载入的空白状态作结论。

记录：

- [NCS观测](../artifacts/fidelity-research/ncs-live-material-observations.json)、[Kensho观测](../artifacts/fidelity-research/kensho-live-material-observations.json)：实际DOM、已上传GPU uniforms、shader特征统计；没有复制完整第三方shader作为工程代码。
- [资源请求元数据](../artifacts/fidelity-research/bill-public-texture-resources.json)：仅URL和传输大小，没有将原站贴图复制为网页资产。
- [NCS悬停右上](../artifacts/fidelity-research/bill-ncs-hover-upperRight.png)、[NCS聚焦](../artifacts/fidelity-research/bill-ncs-focus.png)。
- [Kensho静态](../artifacts/fidelity-research/bill-kensho-idle.png)、[Kensho悬停右上](../artifacts/fidelity-research/bill-kensho-hover-upperRight.png)、[Kensho聚焦](../artifacts/fidelity-research/bill-kensho-focus.png)。

### NCS并非静态波纹加树影

静态展示用 `/stamps/ncs-384.avif`，hover显示独立 `reliefCanvas`，画廊缓冲约190×238，聚焦431×540。实际请求还包含 `/relief/ncs-height-sm.webp` 和 `/relief/coatnormal-sm.webp`。它们是不同于静态图稿的高度与涂层资源。

随NCS指针位置变化的物理材质程序，实际上传了 `normalMap`、`displacementMap`、`clearcoatNormalMap`、环境贴图及光源参数。稳定态roughness约.62、metalness为0、clearcoat约.55、clearcoatRoughness约.20、normalScale约(1.6,1.6)、displacementScale约.09；有暖定向灯与半球环境光。其表面反射/微几何层次不能用一个图案亮度梯度或大块alpha乘影完全替代。这些值属于原站物理材质的单位，并不等于本工程同名滑块应填相同值。

浏览器直接解码公开NCS基图，仅作小块颜色统计，结果见[采样](../artifacts/fidelity-research/base-image-color-samples.json)：中心7×7平均RGB约(160,187,137)，内侧四角约(215–222,220–225,207–215)，纸边约242中性灰。基图是中央较深、边缘淡化的绿色，不是全票均匀的亮黄绿。颜色采样不是下载/复用原图，也不能代替图案结构。

### Kensho有自己的黑银材质

原站Kensho初态白纸黑C；hover之后是明显的黑银金属浮雕/反射，文字和C形边缘有立体层次。原站聚焦同样保持这一材质。不能声称原站Kensho在交互时始终是一张白纸，也不能因为本轮2.mp4灰棕投影不对，就认定“全部改成更白的纸”能与原版一致。

实际请求 `/relief/kensho-kogei-height-sm.webp`。对应随Kensho指针变化的程序采用metalness=1、roughness=1、ior≈1.85、normalScale=(1,−1)、displacementScale≈.075、envMapIntensity≈.45和灰银sheen，与NCS的非金属涂层材质不同。

所以本次至少有两项需要分开：NCS的参考来自1.mp4，应保持浅绿印刷和细密暖反射；Kensho的问题来自最新2.mp4，不能继续套用同一灰棕光场。用户随后明确选择保留印刷纸面、不要浮雕和金属化，因此**不采纳原站Kensho的黑银外观**，也不将“复刻黑银浮雕”列为待办。继续保留基图、细微压纹光照，属于用户选定的产品方向，不是未完成的金属化。

## Microsoft和场景8的作用范围

本轮重新实访 [Microsoft AI](https://microsoft.ai/)：720×450 WebGL2缓冲放大至1440×900CSS；椭圆光域radius=.354，sine frequency=.35/amplitude=1.18，Voronoi amount=.534/spread=1/skew=.84，柔焦amount=.754。指针右上时光域uPos约(.8333,.8)，时间仍推进。本轮截图：[首页](../artifacts/fidelity-research/microsoft-rechecked.png)；数值保存在NCS观测JSON中的microsoft节点。

Bill Guo也存在与之相似的椭圆/sine/Voronoi/柔焦局部光域，而不只是物理表面。但实测NCS活动局部光域的Voronoi amount约.178，另有独立物理材质，两层不可合并成“全票以大光场相乘”。因此本次差异不是简单的“原站完全没有斑驳光”，而是光域、表面高度、照明与合成所处层级不同。

只读检查 `E:/Software Development/幽兰/src/viewer/dappledLightScene.js` 和 `dappledLightShaders.js`：它是椭圆光照mask经正弦逆映射、拉伸Voronoi与50采样散焦，再作RGB背景合成。没有每枚邮票的独立height/normal/roughness资产，也没有NCS/Kensho的物理材质分配；保留其算法不能自动取得原站邮票表面。

本次读取时源文件SHA256仍分别为 `3083B89B26E7EA493FA9B71D55F88F19FBE4C3F4E807BF51BDE62F7D475BCDD2` 与 `C55F47B285731CBE0A26C68EFFEF8E3DBF5BB1EFB0378B7F2E4AF70ED2825452`，与前轮审计一致。原项目保持只读。

## 本轮调整依据与验证边界

实现按层处理：静态底图移除错误粗波纹、恢复更柔和的绿色中心/淡边；微细压纹光照独立于静态印刷，仅在交互时产生细微反射；不能默认把整个黑白票染成灰棕。NCS与Kensho的原站材质有实测差异，但本项目遵循最新用户选择，两者均保留印刷纸面，不新增浮雕、凸字或黑银材质模式。

验收应分别查看未悬停底图、悬停细纹反射、黑白票明暗、聚焦四方向及移出恢复，而不能只确认滑杆改变了uniform。原图稿和专用高度资产未进入本工程，不能宣称调整若干数字就能逐像素一致；本页提供可核实的问题定位和改进方向，最终代码/参数和实际结果以本轮最新验证为准。

## 中途材质试验（已被最新用户选择替代）

中途试验先将静态NCS图稿改为中央较深、边缘淡化的柔绿底，删除此前强制烘焙的74级等高线和170排正弦横线。该版本的 `src/rendering/SurfaceTexture.js` 生成512×640程序化纹理：RG保存独立微细压纹法线，BA保存从原创印刷图案提取的边缘斜率。纹理不写入未交互的底图；它近似表面高度的照明效果，没有复制原站的专用高度贴图或真实顶点位移。此处是历史试验结构，不代表用户纠偏后的最终材质约定。

该试验的 `src/rendering/StampMaterial.js` 表面路径采用GGX分布、Schlick Fresnel和Smith几何项，曾区分纸面透明涂层与黑银反射，并用解析studio光板近似环境反射。它没有复制原站height、normal、环境贴图或shader。但是用户已否定浮雕/金属化方向，不能因技术上能够实现，就把它保留为默认或当作用户要求。

以下是中途试验的实际Chrome截图，已显著标记“中途研究稿 / 非最终目标”，仅保存研究过程：

- [NCS中途研究稿](../artifacts/fidelity-research/same-stamp-ncs-draft.jpg)
- [Kensho中途研究稿](../artifacts/fidelity-research/same-stamp-kensho-draft.jpg)
- [原图、精确裁切矩形、缩放及输入SHA记录](../artifacts/fidelity-research/same-stamp-comparison.json)

复现命令：`python scripts/compare-fidelity-stamps.py`。远端裁切来自截图同时记录的DOM canvas矩形；本地裁切来自 `surface-verified.json` 对应状态的GPU投影四角。两边只作等高缩放，保留比例与姿态，没有拉直、替换图案或为提高分数作几何配准。鼠标位置、视口和艺术图不同，因此没有给出逐像素相似度分数。

这些中途画面曾确认静态粗波纹移除，也暴露出银材质与原站仍有残差；它们**不能作为最终交付或效果一致的证明**。用户的纸面保色选择已替代追赶原站银面/凸字的探索，不再把缺少金属高光或凸字当成最终缺陷。

以上是对提供的实际截图及当前代码的核对，不代替主任务正在执行的最终交互、资源、面板和生产验证；测试结果以本轮最终报告为准。

## 当前交付方向

六枚邮票保留原印刷设计与纸面颜色，只改变指针交互的光影；微细压纹允许，浮雕、凸字、金属化不采用。参考网站的材质差异继续作为知识保留，不扩大用户要改的内容。当前材质已去除银面/凸字替换路径与对应控件，不用上面的中途银图充当最终画面。

最终 `SurfaceTexture.js` 的512×640纹理仅保存独立、浅幅的纸面法线，不读取图稿生成凸字高度，不对顶点作真实位移。`StampMaterial.js` 使用GGX/Schlick/Smith和纸面涂层反射，叠加跟随局部指针的柔和暖光亮域及较弱的反向暗部；不把整张图替换为金属，不让原先宽斑驳暗影成为默认效果。背景保持静态，选择场景8模式时仍只在票面取样。

### 最终纸面保色画面

- [最终光影对照](../artifacts/fidelity-research/final-light-comparison.jpg)：NCS原站光影参考与本轮NCS；Kensho用户2.mp4修改前与本轮Kensho纸面，明确区分before/after，没有把原站银图当作目标。
- [裁切、比例与输入SHA](../artifacts/fidelity-research/final-light-comparison.json)；复现 `python scripts/compare-paper-light.py`。原站矩形来自同次截图DOM，本轮矩形来自对应GPU投影四角；录屏2的第60帧纸张框为人工估计，已单独标注。
- [5秒真实指针光影](../artifacts/fidelity-research/paper-light-pointer.webm)、[画廊与聚焦状态记录](../artifacts/fidelity-research/paper-light-verified.json)。底图、裁切、视口和轨迹不同，不计算逐像素相似度。

本轮[光影专项报告](../artifacts/fidelity-verification/report.json)记录11项通过，执行前后5个关键源码SHA一致，并与本页收尾时的代码一致。验证不只检查截图hash：固定倾角后，将聚焦指针从(.2,.2)移到(.8,.8)，1521个票内样本的平均绝对亮度差约9.21（0–255）、P95约18.92；背景ROI完全相同，场景8离屏更新为0。这证明默认纸面模式中实际可见的指针照明，不是通过物体倾斜或无关背景变化制造差异。

同一报告对6枚票分别比较开灯前后，原有彩色样本的色度方向保持；Kensho黑墨样本平均亮度变化约.22，黑墨仍然是原印刷。另有[整张侵蚀纸张多边形的开灯前后统计](../artifacts/fidelity-research/paper-light-pixel-metrics.json)：NCS平均亮度增加约2.75，Kensho约2.12。它与上述9.21的采样范围、对比动作不同，不能混成同一指标或当成与原站的相似度。

仍保留的差异是原创图稿/齿孔/版面与原站不完全相同，原站更强的专用高度/位移和黑银材质按用户选择不复制。本轮交付目标是原界面上的可见柔光与微纸纹，不是重做整枚邮票的立体外观。其他构建、面板、生产和工程记忆验收由主任务最终记录汇总；这里不把未提供的结果写成通过。
