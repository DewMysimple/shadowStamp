# 快速切换邮票的光影延迟

2026-10-27，基线`73cba51`。用户反馈快速切换不同卡片时光影要等一会才显示；本轮只修正交互时序，八态图稿、布局、暖光颜色/算法、51字段与保存版本保持不变。

## 根因与修正

原`paperLight()`同时要求`activity > .001 && uBlur < .02`。非活动票默认虚化11px，新票按`.075s`指数缓动恢复，因此整段暖光要等约`.075 × ln(11/.02) = 473ms`才开放。真实鼠标三次切换实测约472.2/473.3/471.0ms；每票只停留100ms时，光影活动量已增长却整次都被门槛挡住。[默认基线](../artifacts/rapid-hover/baseline.json)、[分析](../artifacts/rapid-hover/analysis.json)。切卡期间没有重新解码图片或重建材质。

- `StampMaterial.js`移除虚化阈值对照明的硬开关，光影渐入和图稿回清晰同时开始，保留各自原有缓动。
- `DappledLight.js`增加`setActiveStamp(id)`：活动票变化时，将共享光图的指针直接交接到新票最终局部UV，并在同一渲染帧刷新缓存；不等待持续流动的24fps间隔。票内后续指针移动仍按用户设置缓动，不重置流动时间、不分配新纹理。
- `StampGallery.js`将当前活动ID传给光场。仅DEV诊断增加owner、blur和目标UV，便于实测。

## 当前证据

| 检查 | 实际结果 |
| --- | --- |
| `npm test` | 15项通过，含1项卡片交接立即刷新、同票缓动/节流与关灯复用验证。 |
| `npm run build` | 成功，Three既有约514kB依赖块不变。 |
| `npm run test:rapid-hover` | 6项通过，真实鼠标40/80/120ms三档共24次切换，首帧owner正确且开始出光；自定义`.8s`渐入、关灯、减少动态、空闲停帧和26纹理复用通过。[报告](../artifacts/rapid-hover/after-report.json)。 |
| 默认流动/倾斜开启的独立复查 | 不覆盖参数，八票100ms×3轮共24次切换，首帧owner正确、指针与目标相等；26纹理/5程序稳定，0页面错误。已目检100ms时怒/动/疑均有暖光，无明显闪白。[复查](../artifacts/rapid-hover/review.json)。 |
| `VERIFY_OUTPUT=artifacts/rapid-hover/browser npm run test:browser` | 原有八态鼠标/触摸/键盘、聚焦反向/重选、resize、生命周期与WebGL回退14项通过。[报告](../artifacts/rapid-hover/browser/browser-report.json)。 |
| `PRODUCTION_URL=http://127.0.0.1:4280/ VERIFY_OUTPUT=artifacts/rapid-hover/production node scripts/verify-production.mjs` | 当前dist生产4项通过，正常console/page错误0。[报告](../artifacts/rapid-hover/production/production-report.json)。 |

上述环境变量写法是命令语义；PowerShell先用`$env:变量名 = '值'`设置。两个既有回归脚本新增`VERIFY_OUTPUT`仅用于保留前轮证据。本轮没有重跑整套原站光学研究。

定量像素探针冻结流动/倾斜/抬升/缩放，以隔离切卡时序：在切入怒票第一帧，实际GPU`activity≈.0456`、`blur≈10.2086`，对同一几何/同一光图立即重画开光与零activity，48×48区域RGB平均差`.860`，2300/2304像素变化、GL错误0。证明虚化尚未恢复时暖光已参与输出，而非只改诊断值或缩短参数。该受控场景与默认动态复查分别记录。

原始逐RAF数据保留`{baseline,after}-rapid-{40,80,120}-frames.json`。报告中的毫秒为pointerover到GPU draw提交，不是显示器呈现延迟；冷首次悬停仍包含正常首轮GPU编译/上传（约28ms），本轮移除的是每次切卡额外约半秒的等待。根任务另核对24次首帧光图更新数均推进、pointer-target误差均0，并确认当前四个源SHA与最终报告一致。

正常持续流动仍按24fps预算更新，切卡与参数输入首帧可立即刷新。渐出中的旧票保留短暂弱光，不把动态光影铺到背景。无WebGL仍使用平面回退，软件Chrome结果不代表低端真机帧率。
