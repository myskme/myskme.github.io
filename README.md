# 王老师 · MYSKME — 目录 INDEX

个人主页 · *An index of one life*。编辑部/美术馆画册式排版，七章滚动叙事。
纸白 / 深墨 / 单色 三皮肤，离线可用（字体走 Google Fonts + 系统回退）。

**线上**：https://myskme.github.io/

跨文化的摆渡人 —— 白天做品牌与文化出海，周末教英语。
作品与课堂工具见 [作品总目](https://myskme.com/)。

*不喧哗，自有声 — quietly, but clearly.*


## MYSKME 特别棋室

[棋室正式版 3.2.0](https://myskme.github.io/boardroom/)：围棋、五子棋、KataGo 本机陪练、关键手教学、成长花园与原创双生共弈。

- `boardroom/`：独立静态应用及 SHA-256 发布清单；只增加此目录，不替换个人主页。
- `boardroom-dev/`：维护说明、112 项测试、发布脚本与 KataGo 可复现编译来源。测试和脚本直接使用 `boardroom/` 运行源码，模型只存一份。
- 验证：`cd boardroom-dev && npm test`；发布检查：`python scripts/check-release.py ../boardroom`。
- 正式发布记录：[boardroom-dev/RELEASE.md](boardroom-dev/RELEASE.md)。棋谱保存在各浏览器本机，可在棋室偏好设置中导出或导入完整备份。

`myskme.com` 使用独立发布链路；这里的 GitHub Pages 更新不会覆盖其「每日大厅」。
