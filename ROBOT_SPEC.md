# RoboMate 多机型扩展规范（12 款自定义指令机器人）

> 目标：在现有 LH1/LH2 架构上，新增 12 款**指令各不相同**的机器人。
> 每款机器人只需交付 1 个固件（`.hex`）+ 1 个配置（`.json`），并完成本文档第 5 节的「配置驱动改造」，即可被系统自动识别。

---

## 1. 系统架构总览

```
前端 UI (public/js)
   ├─ app.js          界面状态、机型切换、连接/烧录、指令发送、伪代码打字机
   └─ serial-core.js  Web Serial + STK500v1 烧录协议 + 运行时指令下发
        │
        │  HTTP /api/*            Web Serial(USB)
        ▼                              ▼
后端 server/                          ATmega328P 机器人
   ├─ index.js           静态服务 + 启动时加载全部机型
   ├─ routes/api.js      机型列表/切换、指令/烧录/事件日志
   ├─ routes/voice.js    AI 语义理解（自然语言 → 指令序列 + 伪代码）
   ├─ services/profileManager.js  加载 profiles/*.json + 生成 AI 提示词
   └─ db/                sql.js 数据库（指令/烧录/事件历史）
        ▲
        │ 启动时扫描加载
   profiles/*.json         ← 每款机器人的「身份证」：硬件、指令、语义规则、伪代码映射
   firmware/*/robot_cmd.hex ← 烧进芯片的程序（.ino 编译产物）
```

**关键机制**：机型列表完全由 `profiles/` 目录驱动（`profileManager.loadAll()` 扫描所有 `.json`），前端通过 `/api/models` 动态渲染下拉框，烧录时按 `profile.firmware` 拉取对应 `.hex`。**没有任何硬编码的机型清单。**

---

## 2. 添加一款机器人需要交付什么

以新增 `LH3` 为例，只需 2 个文件，命名四者一致：

| 文件 | 作用 | 命名约定 |
|------|------|---------|
| `firmware/LH3/robot_cmd.hex` | 烧进芯片的运行程序（`.ino` 编译产物） | 目录名 = `id`，文件名固定 `robot_cmd.hex` |
| `profiles/LH3.json` | 机型描述 + 指令表 + 语义规则 + 伪代码映射 | 文件名 = `id` |

一致性校验清单（四者必须相等）：`JSON 文件名`、`JSON.id`、`JSON.firmware` 路径里的目录名、`firmware/` 下的目录名。

---

## 3. 固件代码需求（`.ino` 规范）

12 款机器人固件都遵循同一套「LH1 样式」协议，区别仅在**引脚接线**和**指令集**。

### 3.1 硬件平台（保持兼容，烧录工具直接复用）

- **主控**：ATmega328P（Arduino Nano/Uno，16MHz，5V）
- **Bootloader**：STK500v1（Optiboot 兼容）—— 现有 `serial-core.js` 烧录协议依赖它
- **执行器**：舵机（`Servo` 库，50Hz PWM）；可扩展 LED、蜂鸣器、超声波、步进电机等外设

### 3.2 运行时串口协议

- **波特率**：固定 `115200`（8N1，无校验，无流控）—— 烧录完成后前端会 `reopenPort(115200)`
- **指令格式**：`{大写指令} [参数]` + 换行符 `\n`
  - 例：`FW 3\n`、`HOME\n`、`START\n`

### 3.3 程序骨架（setup / loop）

```cpp
#include <Servo.h>
// 声明舵机/外设对象...

void setup() {
    Serial.begin(115200);
    // 舵机 .attach(引脚)，初始化到 HOME 位置
}

void loop() {
    if (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        parseAndRun(line);   // 拆成 cmd + 参数 → 调对应动作函数
    }
}
```

### 3.4 指令集要求

- 固件支持的每条指令，必须与 `profiles/{id}.json` 里 `commands` 数组**一一对应**（命令名、参数范围、语义完全一致）
- 每个 `command` 对应一个动作函数，带参数校验（如步数/角度 `1~20`）

### 3.5 关键约束（最容易踩坑的 3 条）

1. **空闲时绝不主动向串口吐数据**。烧录握手（`syncTest`）与运行时复用同一串口，固件持续输出会干扰 STK500 同步，导致界面永远停在「初始化中」。
2. **`setup()` 里不要打印欢迎信息**，同样会污染烧录前的输入缓冲。
3. **动作函数要有明确起止、不能死循环阻塞串口读取**，执行完回到 `loop()` 继续监听；自主模式（如避障 `START`）必须能被 `STOP` 打断。

### 3.6 编译产物

`.ino` 在 Arduino IDE / PlatformIO 编译后导出 `.hex`，固定命名 `robot_cmd.hex`，放 `firmware/{id}/`。

---

## 4. 配置文件需求（`profiles/{id}.json` 规范）

### 4.1 完整字段模板

```json
{
  "id": "LH3",
  "name": "RoboMate-LH3",
  "type": "humanoid | vehicle | arm",
  "description": "一句话介绍，会喂给 AI",
  "hardware": {
    "chip": "ATmega328P",
    "protocol": "stk500v1",
    "baudRate": 115200,
    "communication": "串口 115200 baud，每条指令以换行符结束",
    "components": [
      { "name": "左腿", "pin": "D10", "type": "servo" }
    ],
    "calibration": {},
    "thresholds": {}
  },
  "commands": [
    { "cmd": "FW", "params": "1~20", "desc": "前进 N 步",
      "method": "forward", "label": "前进", "unit": "步" },
    { "cmd": "MW", "params": null, "desc": "太空步",
      "method": "moonwalk", "label": "太空步" }
  ],
  "commandFormat": "{CMD} {N}",
  "commandValidation": "^(FW)\\s+\\d{1,2}$|^(MW|HOME)$",
  "firmware": "firmware/LH3/robot_cmd.hex",
  "semanticRules": {
    "defaultSteps": 1,
    "severalSteps": 3,
    "maxSteps": 20,
    "shortcuts": { "前进": ["FW {n}"], "停下": ["HOME"] }
  },
  "promptExtras": "补充给 AI 的介绍文案"
}
```

### 4.2 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | ✅ | 唯一标识，必须等于文件名和固件目录名 |
| `name` | ✅ | 下拉框显示名 |
| `type` | ✅ | 只影响 AI 提示词文案；现有映射 `humanoid→人形机器人`、`vehicle→智能小车`、`arm→机械臂`，新类型需在 `profileManager.js` 第 94 行扩展 |
| `description` | ✅ | 给 AI 的介绍 |
| `hardware.chip` | ✅ | 固定 `ATmega328P` |
| `hardware.components` | ✅ | 硬件清单，喂给 AI 提示词 |
| `commands` | ✅ | 指令表，与固件一一对应 |
| `commandFormat` | ✅ | 指令格式说明 |
| `commandValidation` | ✅ | 正则，后端用它过滤 AI 返回的非法指令，**必须覆盖 `commands` 里全部指令** |
| `firmware` | ✅ | 固件路径 |
| `semanticRules.shortcuts` | ✅ | 自然语言 → 指令序列映射；既是 AI 提示，也是无 API key 时的本地兜底解析 |
| `promptExtras` | 可选 | 补充 AI 提示词 |

### 4.3 `commands` 条目字段（核心扩展点）

| 字段 | 必填 | 说明 |
|------|------|------|
| `cmd` | ✅ | 大写命令名，如 `FW` |
| `params` | 可选 | 参数范围，如 `"1~20"`；无参数填 `null` |
| `desc` | ✅ | 给 AI 看的中文说明 |
| `method` | 可选 | **伪代码方法名**，如 `"forward"` → 生成 `robot.forward(...)`；省略则降级为 `robot.execute("FW")` |
| `label` | 可选 | 伪代码注释里的动作名，如 `"前进"` |
| `unit` | 可选 | 参数单位，如 `"步"`/`"次"`/`"度"`；有参数时拼进注释 |

### 4.4 伪代码生成规则（`method`/`label`/`unit` 组合）

| 指令形态 | 生成结果 |
|---------|---------|
| 有参数 + 有 `method`/`label`/`unit` | `robot.forward(3);   // 前进3步` |
| 无参数 + 有 `method`/`label` | `robot.moonwalk();    // 太空步` |
| 无 `method` | `robot.execute("FW 3");`（通用降级） |

---

## 5. 配置驱动改造（每款指令不同，必须改）

现有代码把 LH1/LH2 的标准指令集（`FW/BW/LT/RT/MW/HOME/START/STOP`）写死在 6 处。要让 12 款自定义指令机器人正常工作，需把以下位置全部改为读 `profile` 配置。

### 5.1 伪代码生成（3 处 switch 写死）

| 文件 | 位置 | 改造方式 |
|------|------|---------|
| `server/services/profileManager.js` | 约第 160 行（提示词里 `code 字段要求` 的 `FW → robot.forward` 映射） | 删掉硬编码映射，改为按 `commands` 里的 `method`/`label`/`unit` 动态列出对应关系 |
| `server/routes/voice.js` | 第 143 行 `generateCodeSnippet` 的 switch | 改为通用函数：读 `profile.commands` 的 `method`/`label`/`unit`，按 4.4 规则生成 |
| `public/js/app.js` | 第 578 行 `generateRobotCode` 的 switch | 同上；前端需拿到 `commands`（含 method/label/unit），见 5.4 |

通用生成函数示意（前后端各一份）：

```js
function codeForCommand(item) {
  const parts = item.cmd.split(/\s+/);
  const op = parts[0], val = parts[1];
  const c = item._meta; // 或直接从 commands 条目读
  if (!c || !c.method) return `robot.execute("${item.cmd}");`;
  if (val !== undefined && c.unit) {
    return `robot.${c.method}(${val});   // ${c.label}${val}${c.unit}`;
  }
  return `robot.${c.method}();      // ${c.label}`;
}
```

### 5.2 指令校验（1 处正则写死）

- `public/js/app.js` 第 476 行 `isRawCommand`：`/^(FW|BW|LT|RT|MW|HOME)(\s+\d+)?$/i` 写死。
  → 改为用当前机型的 `commandValidation` 正则匹配（该字段已存在，需下发到前端，见 5.4）。
- `server/routes/voice.js` 第 122 行 `filterCommands` 的 fallback 正则：已优先用 `commandValidation`，仅无 profile 时才走 fallback，影响小，可保留。

### 5.3 方向指示 & 本地兜底（2 处写死）

- `public/js/app.js` 第 197 行 `showDirection`：写死 `FW/BW/LT/RT/MW/HOME` 的方向文案和箭头角度。
  → 加可选 `directionMap` 字段（见 5.5），无配置时降级为通用文案「执行中」。
- `public/js/app.js` 第 564 行 `localParseVoice`、`server/services/profileManager.js` 第 204 行 `fallbackParse` 的通用方向匹配（前进/后退/左转/右转）：
  → 删除硬编码方向匹配，**只保留基于 `semanticRules.shortcuts` 的匹配**（每款机器人用自己的 shortcuts，天然覆盖自定义指令）。

### 5.4 前端拿完整配置

当前 `/api/models/active` 和 `/api/models/select` 只返回 `id/name/type/description/commands/firmware`，**不含** `commandValidation`、`semanticRules`、以及 `commands` 里的 `method/label/unit`。改造时把这些字段一并下发，前端缓存到 `state.activeModel`，供 `isRawCommand`、`generateRobotCode`、`showDirection` 使用。

### 5.5 新增可选字段汇总

| 字段 | 位置 | 用途 |
|------|------|------|
| `commands[].method/label/unit` | `profiles/{id}.json` | 伪代码映射（见 4.3） |
| `directionMap` | `profiles/{id}.json`（可选） | 方向指示：`{ "FW": {"label":"前进","angle":0}, ... }`；无则通用文案 |

---

## 6. 12 款机器人落地清单模板

每款机器人填一行，作为开发 checklist：

| # | id | name | type | 指令集（示例） | 硬件要点 |
|---|----|------|------|--------------|---------|
| 1 | LH3 | | | | |
| 2 | LH4 | | | | |
| ... | ... | | | | |
| 12 | LH14 | | | | |

每款完成后核对：

- [ ] `firmware/{id}/robot_cmd.hex` 已编译放入
- [ ] `profiles/{id}.json` 已创建，四命名一致
- [ ] `commandValidation` 覆盖全部指令
- [ ] `commands[].method/label/unit` 已填（有伪代码需求的指令）
- [ ] `semanticRules.shortcuts` 覆盖常用说法
- [ ] 固件空闲时不吐数据、动作不阻塞串口

---

## 7. 验收清单

1. 启动后端，日志打印 `Models: LH1, LH2, LH3, ...`（全部机型加载成功）
2. 前端下拉框能切到 12 款新机型
3. 每款机型：自然语言 → AI 返回正确指令 → 伪代码用 `robot.{method}()` 形式正确展示 → 指令正确下发
4. 每款机型：烧录 `.hex` 成功，运行时串口 115200 通信正常
5. 断开 API key（无后端 AI）时，`shortcuts` 本地兜底仍能解析常用说法
