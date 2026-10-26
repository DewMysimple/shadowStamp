# 场景8与邮票光效的参数映射

本轮在 `E:\Software Development\幽兰\src\viewer\dappledLightScene.js` 重新读取了实际 `DAPPLED_DEFAULTS` 与 `bindDappledLightPanel`，并核对原始 shader。原项目保持只读。这里列出的面板项来自本地源码，而不是推测 Microsoft 页面有相同的可见调试面板。

## 原场景8的实际控制范围

| 含义 | 原键 | 原默认 | 原面板范围 | 邮票面板键 |
| --- | --- | --- | --- | --- |
| 跟随指针 | followPointer | true | 开/关 | lightFollowPointer |
| 跟随缓动，秒 | responseTime | 0.16 | 0–0.6 | lightResponse |
| 自动流动 | animate | true | 开/关 | lightAnimation |
| 流动速度 | speed | 1 | 0–2 | lightSpeed |
| 光照范围 | radius | 0.354 | 0.15–0.7 | lightCoverage = radius × 2 |
| 细胞密度 | density | 26.7 | 10–45 | lightDensity |
| 光斑倾角，度 | angle | 44 | 0–180 | lightAngle |
| 光斑拉伸 | stretch | 0.84 | 0.3–0.93 | lightStretch |
| 斑驳散布 | scatter | 1 | 0–2 | lightScatter |
| 波纹扭曲 | wave | 0.118 | 0–0.25 | lightWarp |
| 散焦柔化 | softness | 1 | 0–2 | lightSoftness |
| 合成对比 | contrast | 0.26 | 0.1–0.5 | lightContrast |
| 静态颗粒 | grain | 0.65 | 0–2 | lightGrain |
| 珊瑚底色 | background | #ffaaa5 | RGB颜色 | 不复制到邮票或背景 |
| 暖光颜色 | light | #ffd198 | RGB颜色 | lightColor |
| 阴影颜色 | shadow | #4a0035 | RGB颜色 | shadowColor |

上表范围是原场景8的历史源码值；当前邮票面板作了扩展。新增 `lightEnabled` 总开关、`lightIntensity` 强度（0–2）、`pointerInfluence` 指针影响（0–2）。当前覆盖范围为0.1–1.6，流速0–3，密度2–50，角度−90–90°，拉伸0–1，扭曲0–0.5，柔化0–3，颗粒0–1.5，跟随时间0–0.8秒；其他范围见 `src/parameters.js`。光场适配器直接从该文件 `PARAMETER_FIELDS` 获取边界，因此不会在面板滑块之后再按旧场景8范围偷偷裁剪数值。原生键和面板别名共享同一边界。

`lightContrast` 接受0–1，其中0取消光场的空间明暗变化；0.26保留之前邮票合成对比，数值越大明暗分界越鲜明。这个控制并不等同于原场景8把 RGB 光色乘入珊瑚纸面的对比合成。

光场模块保留上一版适配默认值：speed 0.65、softness 1.15、coverage 0.708、density 26.7、angle 44、stretch 0.84、scatter 1、wave 0.118、light #fff1cf、shadow #908470、pointerInfluence 0.85、responseTime 0.16。当前应用面板的参考预设可覆盖这些值，以 `src/parameters.js` 为准。这些是邮票适配值，不是 Microsoft 原站的已知参数。

## 为什么同一组参数仍可能不同

1. 原场景8为全屏UV，`aspect = viewportWidth / viewportHeight`；邮票光场固定为局部UV，aspect 0.786，384×480离屏纹理。相同密度在横向包含的细胞数不同，且光场随邮票一起旋转和缩放。
2. 原场景8有珊瑚纸色、RGB场、五点重建、overlay与乘法合成；邮票使用模糊后光场的alpha控制印刷图案上的暖光和软阴影，以保留艺术印刷。把珊瑚底色照搬会污染原画，并不能复现邮票纸面。
3. 原场景8的颜色加权散焦保留在本地迁移模块中，但当前邮票取样其alpha作为明暗遮罩。最终颜色由邮票材质单独控制，所以色值相同不代表最终颜色相同。
4. 原场景8自动每个活动帧更新；邮票昂贵场计算最多24次/秒，其他变换保持主渲染帧率。改变速度时要区分时间流速、跟随时间常数与更新频率。

因此需要同时调整形态、合成与运动，不能仅改变一个“强度”来消除所有差异。原站图案/纹理资源不同造成的差异也不属于参数问题。

## 票面浮雕与斑驳光场是两层不同的效果

本轮视频对照显示，原票面细密轮廓上有方向相关的浅黄、暖桃色高光，上一版较宽的斜向明暗块不能单靠增加对比来替代这种细节。新增 `surfaceRelief`（默认0.22，0–1）和 `surfaceShine`（默认0.25，0–1）控制票面浮雕与暖光反射。它们不属于幽兰场景8的原始参数，也不是原站材质代码的复制。

实现从当前邮票印刷图自身的亮度提取高度，仅额外读取左右上下4个相邻纹理像素，计算中心差分法线；局部指针方向决定面光方向，比较扰动法线与平面法线的漫反射差，以及Blinn半程向量的高光差。暖色高光只增加在实际印刷轮廓附近，不生成另一套独立等高线，不替换艺术图，不添加彩虹。材质保留原印刷色与细节，透孔alpha保持一致；6枚邮票均可响应，foil仅轻微调节强调程度。

采样步长来自 `uArtworkResolution`（实际canvas纹理宽高），不随屏幕聚焦倍率变化。该分支仅在光照活动、浮雕大于0且票面没有被虚化时执行；没有时间驱动或额外RT，关闭浮雕后不执行4次邻域读取。`surfaceShine` 需要浮雕才能产生轮廓高光；光影总开关关闭或强度为0时同时禁用表面反射。根控制器同步 `uSurfaceRelief`、`uSurfaceShine`，材质创建时从texture.image填入分辨率。

## 本轮接口和性能约束

`createDappledLight(renderer, options)` 返回稳定对象，增加 `configure(values)` 和 `needsFrame`。configure接受上述面板键，也接受既有原生键；保持 `.parameters` 对象身份、2张RT及材质身份不变。背景色仅在显式传入原生 `background` / `focusColor` 时修改，不跟随光照参数。

关闭光照或强度为0时，场时钟与离屏绘制都停止；仅关闭自动流动时，鼠标仍可驱动光场，收敛后停止调度；关闭指针跟随后柔和回中。减少动态模式固定光场时间与中心。参数变更会使相关uniform/缓存失效，无需重新创建WebGL上下文、加载纹理或替换邮票材质。光颗粒为邮票局部UV中的静态值，不修改背景纸颗粒，不随时间闪动。

`tests/dappled-controls.test.js` 验证禁用时不增加离屏pass及时间、再启用复用纹理、暂停流动仍可跟随和完全收敛、关闭跟随回中、减少动态固定、异常导入值和0值边界，并逐项检查所有公开光场滑块的最小/最大值能完整到达适配器。真实Chrome进一步运行了最小值、最大值、负角度组合，读取GL实际uniform，确认负角度、半径、密度、拉伸、柔化与输入一致，未出现非有限浮点上传、GLSL警告或页面错误，3组复用同一RT纹理：`artifacts/controls-research/optical-range-edges.json`。屏幕像素和完整面板交互仍由整页浏览器验证覆盖。
