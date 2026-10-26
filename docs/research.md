# 研究记录

研究日期：2026-10-26。记录仅将实际读取或运行过的内容列为事实，尚未证实的机制另列。

## 最终用户要求：光在悬停邮票上

用户先提供场景8截图，随后明确纠正：“不是让背景有光，是让在鼠标悬停交互在邮票上的效果有光”。这条直接要求优先于目标文件的背景光影描述。最终复用场景8 field/50采样 blur生成邮票局部光场，材质通过自身vUv采样，只给当前交互票淡入暖光/软影，移出淡出。背景只保留静态暖白纸粒。取消独立背景光影模式、移除彩虹色带。最终证据为 `artifacts/light-study/final-report.json`、`final-hover.png` 与 `light-motion.webm`；早期编号图仅为研究过程。

## 目标工程与现有资产

目标根目录为 `C:\Users\Administrator\Desktop\炫技3`。初始目录仅有 `source/` 和一段 MP4，没有 package.json、React 代码、Three.js 材质或 Shader，也没有 Git 仓库。因此无法在当前工程封装所谓“已有镭射 Shader”；不能声称已复用它。本次新建 React + Vite + 原生 Three.js 工程，将镭射材质独立封装，保留以后替换材质适配器的边界。没有删除、覆盖或改写任何既有镭射代码。

## 视频证据

已解码全部 286 帧，并生成覆盖全时段的五张全帧联系表，而非仅抽取首中末截图。原始分辨率 2912×1952；视频流时长约 5.255 秒，末帧 PTS 5.236667 秒，音视频容器时长约 5.312 秒；VFR，平均约 54.424 fps，名义 56 fps。详见 [逐帧记录](video-analysis.md) 与 `reference/`。

可确认：初态极大留白、右下方六枚邮票，NCS 绿色主票覆盖黑白大 C，下面压有灰色复古票，右边和底边存在有意裁切。主票初态中心约 (59.6%W, 53.3%H)、顺时针约16°。Hover 于约 0.218 秒首次出现，其他邮票在约 0.22–0.43 秒虚化，标签是深色胶囊，浅色等宽大写字，锚定主票上缘。镭射随鼠标持续变化，不是一次性的定长播放。

点击导致的视觉变化约始于 3.112 秒（视频不能证明精确鼠标按键时刻）；约 3.148–3.54 秒移动、扶正、放大、背景转暗、其他票消失并行进行。焦点票约放大 2.2–2.3 倍，中心接近 (48%W,50%H)，最终仅余主票和底部 `CLICK ANYWHERE OR PRESS ESC.`。视频不含退出。颜色采样初始背景约 #fbf7f1、暗背景约 #22201c；纹理与压缩会影响单像素读数。

## 真实网页观察

实际浏览器成功访问 [billguo.me](https://billguo.me/)，web 文本抓取工具的失败不能代表浏览器无法访问。DOM 与 computed style 显示：邮票由 DOM wrapper/paper/image 组成，hover 其他票约 4px blur，约 .16 秒；当前票有倾斜和缩放；双层 drop-shadow 沿 alpha；标签是 Departure Mono 的深色小胶囊。更多实测、截图及手机观察见 [网站记录](web-research.md)。第三方网站素材和生产 JS 未复制到成品。

对 [microsoft.ai](https://microsoft.ai/) 的研究会区分当前站点与本地旧复刻：站点内容已变化，不能将当前访问推断为历史画面完全相同。证据边界记录在网站报告。

## 幽兰场景8

已真实读取 E 盘，非环境不可访问。原文件为 `E:\Software Development\幽兰\src\viewer\dappledLightScene.js` 与 `dappledLightShaders.js`。采用共享 Three renderer、正交全屏面片、两个半分辨率 RenderTarget，三 pass：拉伸 Voronoi 场和正弦逆向 UV 扰动 → 50样本黄金角散焦 → 纸张/颜色合成。无需外部纹理。时间与指数鼠标阻尼驱动；具有 reduced-motion 和 dispose。原默认珊瑚红与紫影不适合暖白邮票背景。

选择 C：迁移原光场与散焦算法，独立组织生命周期，把全屏光场改为384×480、固定邮票比例的离屏光场。以当前票的局部UV控制指针，不以屏幕UV控制背景；只有hover/票内交互活动时推进时钟和重算，上限24fps。全部与邮票共用一个renderer。源项目保持只读。详细资源、事件和性能审计见 [场景8审计](scene8-audit.md)。

## 实施决策与证据边界

- 视频优先决定构图与时序；实际站点用于验证连续 hover、标签和输入行为。
- 桌面保留自由叠放及留白；移动端重新配置六票坐标以避免参考中的边缘裁切。
- 所有邮票插画以 Canvas 2D 程序化原创设计，不重复六次同一图片；齿孔从边界扣除半圆，保留真实 alpha 阴影。
- 没有原镭射代码输入时，新材质是重建而非声称原始复用。后续可仅替换材质工厂，布局、纹理和时间轴不依赖它。

技术 API 核对使用官方 [Three ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)、[WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) 和 [Vite](https://vite.dev/guide/) 文档。
