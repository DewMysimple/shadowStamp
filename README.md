# Postal Studies · 光与纸的交互展览

React + Vite + 原生 Three.js。保留邮票印刷图案，只有一套默认开启的暖光：有机光斑、浅纸纹、柔和暗部与周围投影共同作用。没有预设或材质模式切换。背景为静态暖白纸面。

## 运行

需要 Node.js 22.12+（本机验证为24.16）。在本目录运行：

```powershell
npm install
npm run dev
```

打开终端打印的地址，默认 [http://127.0.0.1:4173/](http://127.0.0.1:4173/)。端口占用时 Vite 会选择后续端口。

- 悬停后，纸面反光与细微压纹随指针方向渐显，移出渐隐。静态图稿中已移除此前额外绘制的粗波纹；没有凸起浮雕、立体字边或金属化。
- 悬停也显示名称、抬升当前票并虚化其他票；点选进入暗色聚焦。
- 点击、右上返回或 Escape 退出；触屏直接点选。
- 聚焦后可在票内继续移动鼠标或拖动手指，引导局部光照。支持键盘和减少动态偏好。
- 左上角“参数控件”直接调节光色、暗部、纹理放大、光斑散焦、周围投影及原有偏转/聚焦。支持单组/全部重置、本机自动保存及JSON导入导出；聚焦后仍可调参。

本轮读取原站公开JS并核对实际GPU参数：此前丢弃彩色光图RGB，漏掉桃橙/珊瑚色和独立橙暖点光；固定密度也不符合原站随尺寸/DPR变化的尺度规则。现已在同一效果中修正。见[源码与参数对照](docs/ncs-light-source-audit.md)、[灯光实测](docs/ncs-environment-source.md)、[参数说明](docs/parameter-guide.md)。旧视频分析保留在[前轮记录](docs/fidelity-pass.md)。

用户后续明确要求光效作用在**悬停邮票表面**，最终版本不显示票面彩虹色带、不把动态光影铺在背景上，也不提供额外的背景光影模式。

## 构建与验证

```powershell
npm run build
npm run test
# 保持开发服务启动，再开一个终端：
npm run test:browser
npm run test:light
npm run test:controls
npm run test:fidelity
```

浏览器脚本使用本机安装的 Chrome（Playwright channel: chrome），不要求下载额外浏览器。其他端口可设置 `VERIFY_URL`。本轮报告和截图统一放在 `artifacts/single-light-verification/`；视觉复查在 `artifacts/single-light-study/`。`npm run preview -- --port 4175` 可预览生产构建，实际端口以终端为准。

## 代码与参数

| 文件 | 职责 |
| --- | --- |
| `src/App.jsx` | 语义按钮、键盘说明、模式切换和无WebGL纸面回退 |
| `src/config.js` | 六票布局/角度/尺寸/层级、虚化与聚焦时间 |
| `src/parameters.js`、`src/ParameterPanel.jsx` | 四组实时参数、验证、保存与导入导出；仅一个默认效果 |
| `src/artwork.js` | 六种固定seed的原创印刷图案和真实alpha齿孔 |
| `src/rendering/SurfaceTexture.js` | 独立于印刷图稿的细密表面法线，创建一次并随材质释放 |
| `src/rendering/StampGallery.js` | 一个renderer、一个RAF、统一坐标/输入/生命周期 |
| `src/rendering/StampMaterial.js` | 局部UV采样光场、按hover强度合成纸面暖光、连续alpha虚化 |
| `src/rendering/ncsLighting.js` | 原站实码与GPU核实的主光/橙暖点光及非金属浅纸面参数 |
| `src/rendering/DappledLight.js` | 384×480邮票光场、强度/速度/颜色/柔化/覆盖范围/开关与缓存 |
| `src/rendering/dappledShaders.js` | 场景8原始光场、50采样散焦、静态纸面输出 |
| `src/motion.js` | 可在中途反向的统一聚焦进度 |

没有运行时远程图片、字体或CDN依赖。邮票图案由代码生成；没有把视频帧或网站素材当成网页纹理。

## 工程记忆与Git

使用用户指定的 **standard** 工程记忆：[wiki_memory/README.md](wiki_memory/README.md)。新会话按根 `AGENTS.md` 和记忆协议读取当前状态。

每轮完整对话只要修改本项目文件，结束前须同步相关记忆、验证并完成本轮本地Git提交；无修改不空提交。不自动推送或发布。仓库已初始化在本工程目录，基线提交为 `2345174`；当前交付状态以 `git status` / `git log -1` 为准。

## 研究与交付记录

- [研究总览](docs/research.md)、[实际网页观察](docs/web-research.md)
- [视频286帧分析](docs/video-analysis.md)、[幽兰场景8审计](docs/scene8-audit.md)
- [架构](docs/architecture.md)、[画面对比](docs/visual-comparison.md)
- [工程验收与文件清单](docs/validation.md)
- [本轮4段视频分析](docs/controls-video-analysis.md)、[网站重新实测](docs/controls-web-research.md)、[场景8参数映射](docs/controls-scene8.md)

初始工作区只有MP4，未包含任务书所称的既有镭射Shader。未修改或删除此类旧代码；最终纸面材质为新建模块，可在取得原资产后替换适配。六枚图案为原创近似设计，并不等于复原原网站所有插画。参考视频不含退出或手机画面，这两部分为本工程独立实现。
