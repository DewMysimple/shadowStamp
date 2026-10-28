# 当前验收：六种艺术光影算法

2026-10-28，分支codex/redesign-lion-stamps、基线59890ef加本轮修改。按用户新要求提供六个不同算法，包含旧版乘算与本工程新版局部加光，默认保留新版。12张图稿与界面机制保持。[算法说明](light-presets.md)、[同参对比](../artifacts/light-presets/comparison.png)、[面板预览](../artifacts/light-presets/preview.png)。

| 命令 / 核验 | 结果与本轮证据 |
| --- | --- |
| npm test | 19项通过，含六预设范围、枚举白名单、旧存档兼容、法线资源释放。 |
| npm run build | 成功；Three.js约514kB依赖块提示仍存在。 |
| npm run test:presets | 8项通过；GPU分支0–5、真实控件、佛山/田阳各15对画面有差异、禁用时5120点RGB采样完全相同、32×32桌面像素静止、50个纹理稳定、导出/导入/刷新、手机、减少动态。零浏览器错误/警告。[报告](../artifacts/light-presets/report.json) |
| npm run test:controls | 20项通过，52字段与实际GPU边界、真实JSON文件导出/导入、本机保存、聚焦和手机控件。[报告](../artifacts/light-presets/controls/report.json) |
| npm run test:browser | 14项通过，12票鼠标/触摸/键盘、转场、资源循环、dispose、减少动态与无WebGL回退。[报告](../artifacts/light-presets/browser/browser-report.json) |
| npm run test:rapid-hover | 6项通过，快速切换首帧实际光影、40/80/120ms逐票循环、资源/背景稳定、手调渐隐与减少动态。[报告](../artifacts/light-presets/rapid-hover/after-report.json) |
| 隔离材质历史回归 | 同印刷与光图、横竖两种尺寸，本工程新版对59890ef、旧版对桌面11d5049的RGBA8逐通道差异均0。[条件与结果](../artifacts/light-presets/baseline-equivalence.json) |

浏览器使用本机Chrome/SwiftShader，VERIFY_URL=http://127.0.0.1:4311/；浏览器与快速悬停报告另设VERIFY_OUTPUT到本轮目录，CHROME_PATH指定安装路径。历史报告保持历史，不归为本轮证据。

验收中修正了旧参数脚本把小邮票区域当作空白背景的采样错误，并将采样尺寸适配当前12票布局；原失败不是背景动态。另遇Windows下载文件锁使Vite watcher EBUSY退出，已忽略artifacts输出目录的文件监视；重启本轮服务后参数20项完整通过。没有修改用户已运行的其他服务。

此轮没有重做图稿/地标准确性审查；低端真机帧率仍未覆盖。下面均为前轮验收记录。

---

# 前轮验收：12枚地域狮舞邮票

2026-10-28，地域图稿版本。三组各4枚：广东竖版、中国横版、世界超长竖版。当前分支`codex/redesign-lion-stamps`，提交前基线`11d5049`，报告针对该revision上的本轮工作树变更。

| 命令 | 结果与证据 |
| --- | --- |
| `npm test` | 16项通过，含12张适配画幅布局与小屏边界。 |
| `npm run build` | 成功；Three.js依赖块约514kB，仍有Vite的大块提示。 |
| `npm run test:stamps` | 6项通过：12张独立图稿/原始比例与SHA、三组筛选、逐票暖光命中、背景像素静止、聚焦返回、390×844和320×568触摸；浏览器错误、控制台错误、失败请求均为0。[报告](../artifacts/region-stamps/verification/report.json) |
| `npm run test:browser` | 14项通过：12票鼠标/键盘/触摸、焦点转场与恢复、跨尺寸聚焦定位、10轮循环资源稳定、减少动态、dispose、WebGL context loss及无WebGL回退；浏览器错误0。[报告](../artifacts/region-stamps/regression/browser/browser-report.json) |
| `npm run test:rapid-hover` | 6项通过：首悬停与快速切换首帧有实际暖光像素、40/80/120ms逐票循环、资源稳定、闲置时背景静止、自定义渐隐与减少动态。[报告](../artifacts/region-stamps/regression/rapid-hover/after-report.json) |
| `node scripts/capture-region-stamps.mjs` | 导出12张静态票面、总览、广东篇悬停、三组筛选、伦敦聚焦及390×844移动截图；记录中无页面或控制台错误。[采集清单](../artifacts/region-stamps/capture-record.json) |

本机Chrome/Playwright执行；静态桌面纸面像素在所有12票悬停期间一致。悬停暖光只作用于当前邮票的局部光区，静态插画颜色与桌面背景不被整图滤色。总览、三组与移动画面见[总览图](../artifacts/region-stamps/contact-sheet.png)、[桌面画廊](../artifacts/region-stamps/overview.png)、[悬停](../artifacts/region-stamps/hover-foshan.png)和[移动画廊](../artifacts/region-stamps/mobile-overview.png)。

地标精确性与低端真机帧率未覆盖；图稿生成内容是视觉表达，不等同于地图/建筑测绘。旧八态内容验收如下，均为历史证据。

---

# 当前验收：醒狮浅红UI与卡片焦点样式

2026-10-27，基线`6a0c297`。移除邮票按钮周围的绿色焦点框，键盘聚焦在票角显示小红点；浅红色只用于参数面板和界面控件。邮票图稿、票面光影、画廊背景及原参数保持不变。

`node --test tests/parameters.test.js`的4项参数保存检查通过；`npm run build`成功。使用本机Chrome/SwiftShader在1440×900检查初始画廊、真实悬停、键盘焦点样式，并在390×844检查手机画面；焦点态计算样式`outline:none`，小红点保留，邮票和背景颜色与原值一致，诊断错误0。截图见[桌面UI](../artifacts/theme-update/desktop-ui-palette.png)、[暖光悬停](../artifacts/theme-update/desktop-hover.png)、[键盘聚焦](../artifacts/theme-update/keyboard-focus.png)、[手机UI](../artifacts/theme-update/mobile-ui-palette.png)。本轮没有改交互/渲染结构，未重跑整套浏览器回归。原有4173开发预览保留。

下文为前轮八态内容与原站光影的历史验收。

---

# 前轮验收：快速切卡光影

---

# 前轮验收：醒狮八态邮票

2026-10-26，基线`b9d9dfb`加八态内容替换。当前结果、素材SHA、8票鼠标/触摸/回退、26纹理与生产检查见[醒狮验收](lion-stamps.md)。本轮unit14、八态10、机制14、production4和build通过。下文保留上一轮六票光影验收背景，不代表醒狮像素统计；旧六票20纹理与绿墨比例不是当前票面结果。

---

# 前轮验收：单一默认暖光

日期2026-10-26，基线`7d8e63e`加本轮变更；本轮提交由`git log -1`定位。保留原界面、印刷和交互，只有一套默认开启的光影，无预设/材质切换与“场景8”产品命名。允许浅纸纹，不做图案浮雕、位移或金属化。

本轮先查到旧路径未采纸纹，后依用户要求直接审计原站NCS公开代码与实际GPU，进一步修正丢弃光图RGB、遗漏独立橙灯及固定光纹尺度的问题。[原站源码参数](ncs-light-source-audit.md)、[灯光与环境](ncs-environment-source.md)、[本地参数映射](parameter-guide.md)分别记录事实、实际上传值与适配边界。没有复制原站图稿/法线/高度或修改幽兰。

## 实际执行

| 命令 | 最终结果与证据 |
| --- | --- |
| `npm test` | 14项通过：运动/布局、白名单/迁移v4、调度、独立纸纹释放，以及原站四种DPR/尺寸的尺度规则。 |
| `npm run build` | 成功，主JS249.67kB/gzip82.36kB；Three514.45kB/gzip128.86kB。500kB依赖块提示仍存在，不影响构建。 |
| `node scripts/verify-single-light.mjs` | 14项通过，8个源码SHA起止稳定，零错误/警告。[报告](../artifacts/single-light-verification/report.json)。`npm run test:fidelity`保留为该检查的入口别名。 |
| `npm run test:controls` | 20项通过，51字段、28个真实GPU边界，零错误/警告。[报告](../artifacts/single-light-verification/controls/report.json)。 |
| `npm run test:light` | 9项通过，真实默认光图、固定时间下UV作用、24fps上限、背景ROI/移出静止、手机触摸、减少动态及录像。[报告](../artifacts/single-light-verification/light/final-report.json)。 |
| `npm run test:browser` | 14项通过：六票鼠标/触摸、聚焦/返回、中途反向、键盘/焦点、响应式、10轮资源、双dispose、context loss/禁WebGL回退。[报告](../artifacts/single-light-verification/browser/browser-report.json)。 |
| `PRODUCTION_URL=http://127.0.0.1:4280/ node scripts/verify-production.mjs` | 当前生产构建4项通过，HTTP200、单canvas、无DEV诊断；聚焦内调参、导出保存重载、移动触摸、禁localStorage与零警告/错误。[报告](../artifacts/single-light-verification/production/production-report.json)。 |

最终所有检查在橙色RGB/光纹尺度修正后执行；收尾另将当前8个源码SHA逐一对照最终集中报告，mismatches为空。原有4173–4176开发服务保留，本轮4280生产预览仅用于验收。浏览器为本机Chrome/Playwright，部分WebGL为软件渲染，不代表低端真机帧率。

## 参数与像素证据

- 原站与本地GPU均核对浅暖主光`#FFF4E6 × 1.6`、独立橙暖点光`#FFE0B0 × .65`、灯高`.45`；颜色按sRGB转线性RGB上传。原站实测点光RGB为`(.65,.484512736,.282199864)`，不是统一黄色遮罩。
- 光图保留`#FFAAA5`珊瑚中间色、`#FFD198`桃橙亮色和NCS的`#4E5C3C`苔绿暗色；颜色加权散焦后再mix，默认按.26 multiply合成。光纹放大`.5→2`的实际密度`24.220714→6.055179`，与`26.7/(scale*sizeNorm)`及反比4一致，实际像素平均RGB差约6.697。
- 同姿态默认开/关光：[图片与分类RGB统计](../artifacts/single-light-verification/default-warm-pixel-analysis.json)。白纸亮部532点均值约`230.58/229.24/216.37→251.02/235.68/208.80`；绿印刷亮部5152点约`164.83/188.93/143.17→190.82/199.50/143.58`。约95.27%的绿墨仍G通道主导，局部橙色高光确有暖偏；不沿用本轮早期99.95%的中间结果。
- 留白背景PNG哈希在光场活动时保持一致。暂停流动后，纸纹、光色、暗部、光纹放大、周围投影三个控件逐项产生真实GPU/像素变化；不是仅检查React参数值。
- 六票循环复用20张warm GPU纹理，dispose后归0。旧v1/v2/rev3首次升级到唯一开启效果，保留交互/布局；当前v4手调与主动关灯可导出、导入和刷新保存。

## 画面与研究边界

- [当前悬停](../artifacts/single-light-study/hover-craft.png)、[当前聚焦](../artifacts/single-light-study/focus.png)、[修改前/当前/原站并排](../artifacts/single-light-study/single-light-comparison.jpg)。参考姿态、光位和背景不同，不拉直、不改色、不评分相似度。
- [同姿态开光](../artifacts/single-light-verification/default-warm-on.png)、[关光](../artifacts/single-light-verification/default-warm-off.png)、[默认动态演示](../artifacts/single-light-verification/light/light-motion.webm)。
- 最后还修复48tap虚化的重复C轮廓：按采样屏幕足迹使用现有mipmap预滤波，不增加纹理/采样数。[固定C区域观测](../artifacts/single-light-study/defocus-comparison-metrics.json)高频残差RMS约2.3425→1.7160；已独立查看新旧图，活动票字与齿孔清晰。这是本地柔焦质量指标，不是原站相似度。

当前源码仍是原创图稿与浅纸纹适配器；没有原站专用高度/法线、完整RoomEnvironment/Neutral输出链，曝光作为光响应增益。原站参数与实际采用部分、适配差异已分开记录，不能因为灯色相同就声称完整物理渲染一致。无WebGL回退不能呈现同样光效。

`artifacts/single-light-verification/`与`single-light-study/`为本轮最终证据；更早的`paper-light-*`、surface/silver及旧fidelity/controls研究属于历史。源JS全文只留在忽略的分析缓存，永久记录为URL、SHA、偏移及短定位片段；不进入产品运行时。
