# dsh-subagent-hub（子智能体面板）

把 DeepSeek Harness 内置的 **Agent Teams** 能力搬到对话框：工具行左侧多一个 `🧩 子代理` 按钮，点开就能派生队友、发消息、打断成员、管理任务板，不用背工具名。

## 面板里有什么

| 区块 | 能做什么 | 走哪条链路 |
| --- | --- | --- |
| 成员 | 列出当前 Team 的队友与状态（运行中 / 空闲 / 创建中 / 失败）；`说` 发消息、`停` 打断 | Host `agentTeams.listMembers / sendMessage / interrupt` |
| 派生队友 | 点模板快速填表（名字 / 职责 / 任务一次填好），选 `fresh`（空上下文）或 `fork`（继承本对话），一键派生；模板可删可隐藏，也能 `存为模板` | Host `agentTeams.spawnTeammate` |
| 任务板 | 查看共享任务、`完成` / `重开` / `删`、新建任务（同样带模板条） | Host `agentTeams.listTasks / createTask / updateTask` |
| 写进输入框 | 把 `list_agents` / `wait_agent` / `subagent_fork` / `workflow` / `ralph` 等**模型侧**工具的常用指令填进输入框，回车即发 | Client `inputActions.insertText` |

为什么分成两条链路：`spawn_teammate`、`list_agents`、`workflow` 这类是**模型可见工具**，只有模型能调用；而它们背后的 `ctx.agentTeams` 服务在 Host 上，面板可以直接调。所以「成员 / 派生 / 任务板」是真按钮直连服务，「Fork / workflow / ralph」是帮你把话说全再交给模型。

## 派生模板

`派生队友` 区块顶部是模板条，点一下就把三个字段填好，改掉 `【方括号】` 里的内容即可派生：

| 模板 | 默认上下文 | 用来干什么 |
| --- | --- | --- |
| 调研员 `research` | fresh | 多来源检索、每条结论标出处、列出仍存疑的点 |
| 代码审查 `reviewer` | fork | 只读审查 `git diff`，按 阻断 / 应该修 / 可选 分档，带 文件:行号 |
| 测试 `tester` | fresh | 沿用现有测试框架补 正常 / 边界 / 失败 路径，贴真实输出 |
| 实施 `builder` | fresh | 在指定目录内按现有模式改代码，自检后报告改了什么 |
| 文档 `writer` | fresh | 结论 → 步骤 → 注意事项 → FAQ，命令可直接复制 |
| 反方评审 `critic` | fork | 至少 5 个失败场景 + 最脆弱的假设 + 能证伪它的最小实验 |

- 名字与现有队友重名时自动加 `-2`、`-3`，不会因为重名派生失败。
- 每个模板后面的 `×`：自定义模板是**删除**；内置模板是**隐藏**（不想要「反方评审」这种，直接关掉），隐藏后模板条尾部出现 `恢复隐藏 N`，点一下全放回来。
- `存为模板` 把当前表单存进浏览器 localStorage（键 `dsh-subagent-hub.presets`），模板条末尾出现你的自定义模板；隐藏状态存在 `dsh-subagent-hub.hidden-presets`。这些都只在本机浏览器里，换浏览器不同步。
- 内置模板写在 `lib/client.js` 的 `PRESETS` 里，想给全团队常驻就改代码，比存本地更稳。

## 任务模板

`任务板` 区块的建任务表单上方同样有一排模板，点一下填好标题和验收标准：

| 模板 | 填入的标题 | 细节提示 |
| --- | --- | --- |
| 实现 | `实现：` | 要做什么 / 边界在哪 / 怎么算做完 |
| 修 Bug | `修复：` | 现象、复现步骤、期望行为、影响范围 |
| 调研 | `调研：` | 要回答的问题、需要的来源、结论形式 |
| 评审 | `评审：` | 评审对象、关注点、产出形式 |
| 文档 | `文档：` | 写给谁、覆盖哪些内容、放在哪个文件 |
| 发布检查 | `发布检查：` | 版本号、数据迁移、回滚方案、验证清单 |

`×` 的规则和派生模板一致（内置隐藏 / 自定义删除，共用 `恢复隐藏`）；表单填好后点 `存为模板` 存进 `dsh-subagent-hub.task-presets`。

## 安装

这是一个 **DSH bundle 包**，用官方插件管理器按路径安装（不要手写 profile 的 `package.json`，也不要在 profile 目录里跑 `pnpm`）：

```
plugin_manager(action="install_bundle", target="<克隆下来的目录绝对路径>")
```

装完刷新页面，工具行左侧出现 `🧩 子代理`。

- 改 Host 代码（`lib/index.js` / `lib/api.js`）后热重载：`plugin_manager set_plugin(target="include:subagent-hub", enabled=false)` 再 `enabled=true`。
- 改客户端代码（`lib/client.js`）后按 **Ctrl+Shift+R** 硬刷新（插件产物 URL 带 `?rev=`，普通刷新可能命中浏览器缓存，看到的是旧面板）。
- 面板标题旁的版本角标（如 `v0.3.0`）就是当前加载的客户端版本，对不上就是还没刷到新包。
- 卸载：`plugin_manager remove_bundle`。

要求：profile 里启用了 **Agent Teams**（`dsh-experimental-agent-team-profile`）。没启用时面板会明确提示，而不是静默失效。

## 接口

面板与 Host 之间的同源 JSON 路由（前缀 `/subagent-hub`）：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/state?session=<id>` | 当前 Team 的成员 + 任务板 |
| POST | `/spawn` | 派生队友（`name` / `description` / `prompt` / `context`） |
| POST | `/message` | 给成员投递消息（`target` / `text`） |
| POST | `/interrupt` | 打断正在跑的成员（`target`） |
| POST | `/task` | 新建任务（`subject` / `description`） |
| POST | `/task/update` | 认领 / 完成 / 重开 / 删除（`taskId` / `expectedRevision` / `action`） |

业务错误以 `{"error": "..."}` 返回，面板直接把这句话显示出来。

## 结构

```
package.json          bundle 清单 + dsh.client（platform: web）
cordis.patch.yml      insert 一行 subagent-hub
lib/index.js          Host 入口：挂 /subagent-hub 路由
lib/api.js            Host 逻辑：resolve(session→Agent) + 六个动作
lib/http.js           sendJson / readJson
lib/client.js         浏览器产物：按钮 + 面板（__ModuleLoader__ 懒加载工厂）
locale/zh.json        插件说明
test/smoke.mjs        渲染冒烟（迷你 React + fake DOM，不需要浏览器）
```

## 测试

```
node test/smoke.mjs
```

42 项断言：模块注册、slot 注册、面板渲染、成员 / 任务展示、派生模板与任务模板、套用与隐藏恢复、插入输入框、localStorage 写入、版本角标。

## 约定

- 面板只调用 Host 的 `agentTeams` 服务，不复制团队逻辑；角色权限（Lead 才能派生 / 打断）由服务自己判定。
- 派生时 provider 自动从 `subagents.list()` 里挑（`fresh` → `spawn`，`fork` → `fork`），组合里没有就退回第一个可用 provider。
- 样式只用 `--dsw-alias-*` 主题 token，跟随 DSH 明暗主题。
- 会话 id 必须带 `session-` 前缀（Host 侧 `ctx.agents` 的 id 形态），面板从 slot props 直接取，不用猜。

## 许可

MIT，见 [LICENSE](LICENSE)。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
