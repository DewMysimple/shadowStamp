# 醒狮八态邮票

用户2026-10-26要求使用`E:/数字媒体竞赛/张钧儒/lion`中的八张神态图，分别重新设计八枚邮票，并保留现有机制。实现基线为`b9d9dfb`，本轮最终提交见`git log -1`。

## 图稿与映射

源目录只读：`source/public/assets/expression/`。原工程`src/config/assetPaths.js:67–74`及`src/data/lion-expressions.js:20–27`实际使用完整`v2`图；`underpaint-v1`是缺少部分五官的动画底图，未采用。

| 编号 | 神态 / ID | 源文件 | 本地文件 |
| --- | --- | --- | --- |
| 01 | 喜 / joy | lion-joy-v2.png | public/assets/lion-states/lion-joy.png |
| 02 | 怒 / anger | lion-anger-v2.png | public/assets/lion-states/lion-anger.png |
| 03 | 哀 / sorrow | lion-sorrow-v2.png | public/assets/lion-states/lion-sorrow.png |
| 04 | 乐 / delight | lion-delight-v2.png | public/assets/lion-states/lion-delight.png |
| 05 | 动 / motion | lion-motion-v2.png | public/assets/lion-states/lion-motion.png |
| 06 | 静 / stillness | lion-stillness-v2.png | public/assets/lion-states/lion-stillness.png |
| 07 | 惊 / surprise | lion-surprise-v2.png | public/assets/lion-states/lion-surprise.png |
| 08 | 疑 / doubt | lion-doubt-v2.png | public/assets/lion-states/lion-doubt.png |

八张原图均1254×1254 RGBA，各自SHA不同；复制后逐一比对原件SHA一致，没有改动狮头、重新生成五官或修改E盘工程。[源图审计](../artifacts/lion-stamps/source-asset-audit.json)保存路径、尺寸、alpha与SHA。

## 票面与接入

统一720×900排版：米白票纸、细框和双圆线、完整透明狮头、朱红单字题签、英文态名、01–08编号。6列×8行半圆边孔仍是真实透明alpha。八种神态各用对应原图，不通过同一狮头旋转或改文字模拟不同神态。

`config.js`保存八态数据与桌面/手机散落位置；画廊和DOM回退共用数据。`prepareStampArtwork()`先一次解码本地图片，再创建票面Canvas和原有renderer；卸载前完成解码不会启动已卸载画廊。加载期间仍可调整参数，创建画廊时读取最新参数。

保留单一暖光、浅纸纹、局部UV跟随、偏转、其他票虚化、点击聚焦、返回/Escape、键盘、触摸、减少动态和参数保存。光学/材质/法线源码与基线相同；`StampGallery.js`只将默认预览票ID改为集合首项。八票上传后共26张GPU纹理，循环复用，dispose归0。没有浮雕/几何位移/金属化或新效果模式。

## 验证与交付

2026-10-26本轮已实际运行：

- `npm test`：14项通过，覆盖原有运动、八态布局安全边界、参数迁移/保存和光场调度/资源。
- `npm run build`：成功。Three约514kB的既有依赖块提示仍存在。
- `npm run test:stamps`：10项通过，验证八张源PNG的HTTP内容/SHA/解码、八票真实绘图源与独立哈希/透明齿孔、鼠标/键盘/真触摸、单票光影与其余7票GPU虚化、参数、26纹理稳定、320小屏、减少动态和禁WebGL八票回退；正常浏览器错误/失败请求均0。[集中报告](../artifacts/lion-stamps/verification/report.json)。
- `npm run test:browser`：14项通过，八票鼠标/触摸及原有过场反向、重选、焦点恢复、resize、生命周期/context loss回退。[机制报告](../artifacts/lion-stamps/regression/browser/browser-report.json)。
- `PRODUCTION_URL=http://127.0.0.1:4280/ node scripts/verify-production.mjs`：4项通过，当前dist的聚焦调参/导出保存/手机/禁存储与正常浏览器零错误。[生产报告](../artifacts/lion-stamps/regression/production/production-report.json)。
- `node scripts/capture-lion-stamps.mjs`：导出八张720×900透明齿孔PNG，并实际查看总览、画廊与默认暖光聚焦截图。

[总览](../artifacts/lion-stamps/stamps-contact-sheet.png)、[独立PNG目录](../artifacts/lion-stamps/prints/)、[画廊](../artifacts/lion-stamps/gallery.png)、[暖光聚焦](../artifacts/lion-stamps/focus-joy.png)。导出PNG是静态印刷稿，动态光影在网页中实时生成。

原有light/controls/fidelity验证脚本已改为八态ID，未在本轮重复执行整套原站光学研究；不能把前轮六票绿墨像素统计归到新红白醒狮图稿。原站完整PBR适配限制仍见[源码审计](ncs-light-source-audit.md)。
