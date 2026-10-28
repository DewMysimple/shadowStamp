# 本轮光影视觉证据

这些文件对应取消预设后的单一默认暖光，不用于运行时贴图。

最终颜色按后续原站源码审计修正为珊瑚/桃橙/苔绿RGB光图与独立橙暖点灯；不是本轮早期仅偏奶油黄的候选。源码证据另见`../ncs-light-source/`。

- `single-light-comparison.jpg/json`：用户修改前截图、当前暗场暖光、用户原站截图；原比例展示，不拉直、不染色。参考姿态/光位/背景不同，不评分逐像素相似度。
- `gallery.png`、`hover.png`、`hover-craft.png`、`focus.png`、`capture.json`：本轮真实Chrome截图。为便于看细节，暂停流动并固定预览；形态、色调和纸纹使用当前默认。
- `live-ncs-center/upperRight/lowerLeft.png`、`live-observations.json`：当天原站只读复访的真实截图与CSS，属于参考，不是本项目成品。
- `attachment-patch-observations.json`：用户附件SHA与局部采样；不同状态只作方向分析。

实际默认开光/关光、动态调度、控件GPU/像素、手机/减少动态和资源验收见 `../single-light-verification/`。暖光量化使用其中 `default-warm-on/off.png` 和 `default-warm-pixel-analysis.json`。本轮源码SHA见 `../single-light-verification/report.json`。
