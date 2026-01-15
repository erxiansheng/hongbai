#!/usr/bin/env python3
"""
下载 EmulatorJS 核心文件到本地
支持 NES 和街机游戏
"""

import urllib.request
import os
import sys

# EmulatorJS CDN 基础路径
BASE_URL = "https://cdn.emulatorjs.org/stable/data/"
OUTPUT_DIR = "emulatorjs"

# 需要下载的文件列表
# 核心文件在 cores/ 子目录下，使用 legacy-wasm 格式
FILES = {
    # 基础文件（根目录）
    "loader.js": "",
    "emulator.min.js": "",
    
    # NES 核心 - fceumm (兼容性更好，支持更多 Mapper)
    "fceumm-legacy-wasm.data": "cores/",
    
    # 街机核心 - fbneo (Final Burn Neo)
    "fbneo-legacy-wasm.data": "cores/",
}

# 可选的额外核心（按需下载）
OPTIONAL_CORES = {
    # SNES
    "snes9x-legacy-wasm.data": "cores/",
    # MD/Genesis
    "genesis_plus_gx-legacy-wasm.data": "cores/",
    # GBA
    "mgba-legacy-wasm.data": "cores/",
    # GB/GBC
    "gambatte-legacy-wasm.data": "cores/",
    # N64
    "mupen64plus_next-legacy-wasm.data": "cores/",
    # MAME
    "mame2003_plus-legacy-wasm.data": "cores/",
}

def download_file(filename, subdir=""):
    """下载单个文件"""
    url = BASE_URL + subdir + filename
    output_path = os.path.join(OUTPUT_DIR, filename)
    
    # 检查文件是否已存在
    if os.path.exists(output_path):
        size = os.path.getsize(output_path)
        print(f"跳过: {filename} (已存在, {size:,} bytes)")
        return True
    
    print(f"下载: {filename}...", end=" ", flush=True)
    
    try:
        # 添加 User-Agent 避免被拒绝
        request = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read()
            with open(output_path, 'wb') as f:
                f.write(data)
        
        size = os.path.getsize(output_path)
        print(f"完成 ({size:,} bytes)")
        return True
    except urllib.error.HTTPError as e:
        print(f"失败: HTTP {e.code}")
        return False
    except Exception as e:
        print(f"失败: {e}")
        return False

def main():
    # 解析命令行参数
    download_optional = "--all" in sys.argv
    
    # 确保输出目录存在
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print(f"下载 EmulatorJS 文件到 {OUTPUT_DIR}/")
    print("=" * 60)
    
    success = 0
    failed = 0
    skipped = 0
    
    # 下载必需文件
    print("\n[必需文件]")
    for filename, subdir in FILES.items():
        result = download_file(filename, subdir)
        if result:
            success += 1
        else:
            failed += 1
    
    # 下载可选核心
    if download_optional:
        print("\n[可选核心]")
        for filename, subdir in OPTIONAL_CORES.items():
            result = download_file(filename, subdir)
            if result:
                success += 1
            else:
                failed += 1
    else:
        print(f"\n提示: 使用 --all 参数下载所有平台核心")
    
    print("\n" + "=" * 60)
    print(f"完成: {success} 成功, {failed} 失败")
    
    if failed > 0:
        print("\n注意: 部分文件下载失败，将使用 CDN 回退")
        sys.exit(1)
    else:
        print("\n所有文件下载完成，EmulatorJS 将使用本地文件")

if __name__ == "__main__":
    main()
