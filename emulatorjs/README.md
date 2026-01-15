# EmulatorJS 本地文件

将 EmulatorJS 的核心文件放到此目录，可以避免从 CDN 下载，加快游戏加载速度。

## 当前已有文件

- `loader.js` - 加载器脚本 ✓
- `emulator.min.js` - 主程序 ✓
- `fceumm-legacy-wasm.data` - NES 核心 ✓
- `fbneo-legacy-wasm.data` - 街机核心 ✓

## 下载更多核心

使用下载脚本获取其他平台核心：

```bash
# 下载必需文件（NES + 街机）
python scripts/download-emulatorjs.py

# 下载所有平台核心
python scripts/download-emulatorjs.py --all
```

## 支持的平台核心

| 平台 | 核心文件 | 说明 |
|------|----------|------|
| NES | fceumm-legacy-wasm.data | FC/红白机 |
| 街机 | fbneo-legacy-wasm.data | 街机游戏 |
| SNES | snes9x-legacy-wasm.data | 超级任天堂 |
| MD | genesis_plus_gx-legacy-wasm.data | 世嘉MD |
| GBA | mgba-legacy-wasm.data | GBA |
| GB/GBC | gambatte-legacy-wasm.data | Game Boy |
| N64 | mupen64plus_next-legacy-wasm.data | N64 |
| MAME | mame2003_plus-legacy-wasm.data | MAME 街机 |

## 工作原理

系统会自动检测 `emulatorjs/loader.js` 是否存在：
- 存在：使用本地文件
- 不存在：从 CDN 加载

核心文件会由 EmulatorJS 自动从本地或 CDN 加载。
