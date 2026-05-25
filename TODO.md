# TODO

## 待办

（无）

## 进行中

（无）

## 完成

- [x] 跨平台换行符标准化：`* text=auto` + `autocrlf=true` + `.gitattributes`
- [x] CRLF 修复：`setup.sh` 强制 LF，Linux 安装正常
- [x] CLI init 流程：模板部署 → git init → 首次提交
- [x] GitHub release v1.0.5
- [x] schema.yaml 繁转简
- [x] **init 时检测 git 仓库未提交内容** — `git diff --quiet && git diff --cached --quiet` 检查，脏则退出
- [x] **改初始提交消息** — `"oso: launch OpenSpec + Superpowers workflow"`
- [x] **初始提交的清单范围** — 仅 AGENTS.md、.gitignore、.gitattributes、.editorconfig
- [x] **提交前展示变更清单** — `git diff --cached --name-status` 输出
- [x] **更新 TESTING.md** — 对齐 commit 消息、dirty 检查、.editorconfig、install-manifest 路径
