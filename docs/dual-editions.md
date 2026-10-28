# 双版本开发服务器与仓库

2026-10-28用户要求把工作树合入桌面工程，同时保留桌面原有效果和两个CMD入口，并将桌面仓库推送到指定GitHub仓库。

## 启动

首次克隆，在根目录运行 `npm ci`，然后分别双击：

| 启动文件 | 固定地址 | Vite工作目录 | 版本 |
| --- | --- | --- | --- |
| runStart.cmd | http://127.0.0.1:4173/ | 仓库根 | 11d5049原版八态邮票，原参数和光影 |
| runGo.cmd | http://127.0.0.1:4174/ | editions/regional | 74ba21c地域新版，12枚邮票和六算法 |

两个窗口可同时运行。启动器只复用身份相符的服务；端口被其他服务占用时报错，不抢占、不终止、不自动更换端口。相同版本重复打开会直接打开已有地址。端口是浏览器origin的一部分，两版localStorage隔离，保留相同参数存储合同，不清空原版用户参数。`POSTAL_NO_OPEN=1`仅供自动验收时关闭浏览器自动打开。

源码与资源在各自Vite根下使用 `/src`、`/assets`，没有改写图稿路径或渲染算法。原版与新版共用根node_modules（依赖版本一致）；没有指向Codex工作树、E盘或本机素材的运行依赖。新版目录也有自身package和lock，可单独安装。两个build分别输出根dist与editions/regional/dist，互不覆盖。

## Git整合

保留桌面根的原版src/public/index/package/lock/vite配置，不用新版覆盖。将74ba21c已提交的运行文件、测试、文档和历史证据引入editions/regional；新版package名称及dev/preview端口是隔离所需的适配，src/public/index/vite与源提交一致。唯一工程记忆仍在根wiki_memory，不在版本目录复制第二份记忆。

合并提交以桌面11d5049和工作树74ba21c为父节点，保留双方完整历史与两个版本的可运行目录。采用保留原树的合并后加入新版目录；这不是把新版放在另一个未管理的外部工作树。工作树原分支和用户未跟踪prompt/、source/Picture_01/保全，后两者不提交。

远程origin为 https://github.com/DewMysimple/shadowStamp.git ，主分支main。用户已明确授权本轮推送到此仓库；没有网站部署或强制重写远程历史。推送后以 `git ls-remote origin refs/heads/main` 与本地HEAD一致为准。

## 本轮验证

- `npm test`：原版及启动器19项通过；`npm run build`成功。
- 新版目录 `npm test`：19项通过；`npm run build`成功。
- 新版 `npm run test:presets`：8项通过，所有六GPU分支、横/竖实际画面、独立存储和导入导出、移动端/减少动态；报告在[regional-presets/report.json](../artifacts/dual-editions/regional-presets/report.json)。
- 实际通过两个CMD启动/复用：保留原4173服务PID46620；runGo启动4174，重复启动不产生第三个服务器。
- [original-preservation.json](../artifacts/dual-editions/original-preservation.json)：整合前后原版27个运行文件SHA一致，同一浏览器环境与输入的整张PNG完全一致；未操作用户真实浏览器profile。
- 双版本同时运行、资源、悬停/聚焦、原版与新版存储互不干扰等实际验证见[report.json](../artifacts/dual-editions/report.json)。

Chrome/SwiftShader与本机Node24验收不代表低端真机性能。此前每版渲染细节与历史证据分别在各自docs/artifacts内；本轮报告只证明明确列出的整合行为，不重做原站底层研究或图稿地标准确性审查。

## 远程核对结果

实际执行 `git push -u origin main` 成功；2026-10-28用 `git ls-remote --symref origin HEAD refs/heads/main` 核实默认分支main、远程HEAD与合并提交 `bfd742d39a7622d1fc8372bcabd59382dc8499d1` 一致。该合并的两个父节点分别为11d5049与74ba21c，包含两版运行代码与历史。发布证据见[remote-publication.json](../artifacts/dual-editions/remote-publication.json)。本说明的后续文档提交同样推送，最终交付再次核对最新HEAD，不将旧合并SHA冒充文档提交SHA。
