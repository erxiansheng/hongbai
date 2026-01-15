#!/usr/bin/env python3
"""
整理ROM和BIOS文件脚本
- 从Emulator目录提取BIOS文件
- 按平台分类ROM文件
"""

import os
import shutil
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
EMULATOR_DIR = PROJECT_DIR / 'Emulator'
ROMS_DIR = PROJECT_DIR / 'roms'
BIOS_DIR = PROJECT_DIR / 'bios'

# 平台配置：文件夹名 -> (扩展名列表, EmulatorJS核心)
PLATFORMS = {
    'nes': {
        'extensions': ['.nes', '.zip'],
        'core': 'nes',
        'name': 'FC/NES',
        'aliases': ['FC']
    },
    'sfc': {
        'extensions': ['.sfc', '.smc', '.zip'],
        'core': 'snes9x',
        'name': 'SFC/SNES',
        'aliases': ['SFC']
    },
    'md': {
        'extensions': ['.md', '.bin', '.gen', '.zip'],
        'core': 'genesis_plus_gx',
        'name': 'MD/世嘉',
        'aliases': ['MD']
    },
    'gba': {
        'extensions': ['.gba', '.zip'],
        'core': 'mgba',
        'name': 'GBA',
        'aliases': ['GBA']
    },
    'gbc': {
        'extensions': ['.gbc', '.gb', '.zip'],
        'core': 'gambatte',
        'name': 'GBC/GB',
        'aliases': ['GBC']
    },
    'n64': {
        'extensions': ['.n64', '.z64', '.v64', '.zip'],
        'core': 'mupen64plus_next',
        'name': 'N64',
        'aliases': ['N64']
    },
    'pce': {
        'extensions': ['.pce', '.zip'],
        'core': 'mednafen_pce',
        'name': 'PCE',
        'aliases': ['PCE']
    },
    'arcade': {
        'extensions': ['.zip'],
        'core': 'fbneo',
        'name': '街机/ARCADE',
        'aliases': ['ARCADE']
    },
    'mame': {
        'extensions': ['.zip'],
        'core': 'mame2003_plus',
        'name': 'MAME',
        'aliases': ['MAME', 'MAMEPlus']
    },
    'wsc': {
        'extensions': ['.wsc', '.ws', '.zip'],
        'core': 'mednafen_wswan',
        'name': 'WSC',
        'aliases': ['WSC']
    },
    'nds': {
        'extensions': ['.nds', '.zip'],
        'core': 'melonds',
        'name': 'NDS',
        'aliases': ['NDS']
    },
    'psx': {
        'extensions': ['.bin', '.cue', '.iso', '.pbp', '.chd', '.zip'],
        'core': 'pcsx_rearmed',
        'name': 'PS1',
        'aliases': ['PS', 'PSX']
    },
    'psp': {
        'extensions': ['.iso', '.cso', '.pbp', '.zip'],
        'core': 'ppsspp',
        'name': 'PSP',
        'aliases': ['PSP']
    },
    'dc': {
        'extensions': ['.cdi', '.gdi', '.chd', '.zip'],
        'core': 'flycast',
        'name': 'DC/Dreamcast',
        'aliases': ['DC']
    }
}

# BIOS文件列表（需要保留的）
REQUIRED_BIOS = [
    'neogeo.zip',      # Neo Geo
    'pgm.zip',         # PGM
    'skns.zip',        # Super Kaneko Nova System
    'decocass.zip',    # DECO Cassette
    'playch10.zip',    # PlayChoice-10
    'nss.zip',         # Nintendo Super System
    'megaplay.zip',    # Mega Play
    'megatech.zip',    # Mega Tech
    'stvbios.zip',     # ST-V
    'naomi.zip',       # Naomi
    'naomi2.zip',      # Naomi 2
    'awbios.zip',      # Atomiswave
    'cpzn1.zip',       # ZN1
    'cpzn2.zip',       # ZN2
    'taitofx1.zip',    # Taito FX1
    'taitogn.zip',     # Taito G-Net
    'konamigv.zip',    # Konami GV
    'konamigx.zip',    # Konami GX
    'sys573.zip',      # System 573
]

def setup_bios():
    """从Emulator目录复制BIOS文件"""
    print("=== 设置 BIOS 文件 ===\n")
    
    # 创建bios目录
    BIOS_DIR.mkdir(exist_ok=True)
    
    # MAME BIOS 源目录
    mame_bios_dir = EMULATOR_DIR / 'MAMEPLUS' / 'mame0.139' / 'roms'
    
    if not mame_bios_dir.exists():
        print(f"错误: MAME BIOS目录不存在: {mame_bios_dir}")
        return
    
    copied = 0
    for bios_file in mame_bios_dir.glob('*.zip'):
        if bios_file.name in REQUIRED_BIOS:
            dest = BIOS_DIR / bios_file.name
            if not dest.exists():
                shutil.copy2(bios_file, dest)
                print(f"  ✓ 复制: {bios_file.name}")
                copied += 1
            else:
                print(f"  - 已存在: {bios_file.name}")
    
    print(f"\n复制了 {copied} 个BIOS文件到 {BIOS_DIR}")

def create_platform_folders():
    """创建平台文件夹"""
    print("\n=== 创建平台文件夹 ===\n")
    
    for platform, config in PLATFORMS.items():
        folder = ROMS_DIR / platform
        folder.mkdir(parents=True, exist_ok=True)
        print(f"  ✓ {folder} ({config['name']})")
    
    print(f"\n请将ROM文件按以下格式放置:")
    for platform, config in PLATFORMS.items():
        exts = ', '.join(config['extensions'])
        print(f"  roms/{platform}/ - {config['name']} ({exts})")

def analyze_current_roms():
    """分析当前roms目录的文件"""
    print("\n=== 分析当前ROM文件 ===\n")
    
    if not ROMS_DIR.exists():
        print("roms目录不存在")
        return
    
    # 统计各类型文件
    stats = {}
    for f in ROMS_DIR.iterdir():
        if f.is_file():
            ext = f.suffix.lower()
            stats[ext] = stats.get(ext, 0) + 1
    
    print("文件类型统计:")
    for ext, count in sorted(stats.items()):
        print(f"  {ext}: {count} 个")
    
    # 检测NES文件
    nes_files = list(ROMS_DIR.glob('*.nes')) + list(ROMS_DIR.glob('*.NES'))
    zip_files = list(ROMS_DIR.glob('*.zip')) + list(ROMS_DIR.glob('*.ZIP'))
    
    print(f"\n当前目录有 {len(nes_files)} 个NES文件, {len(zip_files)} 个ZIP文件")
    print("建议: 将NES文件移动到 roms/nes/ 目录")

def move_nes_to_subfolder():
    """将NES文件移动到nes子目录"""
    print("\n=== 移动NES文件 ===\n")
    
    nes_folder = ROMS_DIR / 'nes'
    nes_folder.mkdir(exist_ok=True)
    
    moved = 0
    for f in ROMS_DIR.glob('*.nes'):
        dest = nes_folder / f.name
        if not dest.exists():
            shutil.move(str(f), str(dest))
            moved += 1
    
    for f in ROMS_DIR.glob('*.NES'):
        dest = nes_folder / f.name
        if not dest.exists():
            shutil.move(str(f), str(dest))
            moved += 1
    
    print(f"移动了 {moved} 个NES文件到 roms/nes/")

def cleanup_emulator_dir():
    """清理Emulator目录（可选）"""
    print("\n=== Emulator目录信息 ===\n")
    
    total_size = 0
    for root, dirs, files in os.walk(EMULATOR_DIR):
        for f in files:
            total_size += (Path(root) / f).stat().st_size
    
    print(f"Emulator目录总大小: {total_size / 1024 / 1024:.1f} MB")
    print("注意: 这些是小鸡模拟器的本地模拟器文件，网页版不需要")
    print("如果确认不需要，可以手动删除 Emulator 目录")

def main():
    import sys
    
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'help'
    
    if cmd == 'bios':
        setup_bios()
    elif cmd == 'folders':
        create_platform_folders()
    elif cmd == 'analyze':
        analyze_current_roms()
    elif cmd == 'move-nes':
        move_nes_to_subfolder()
    elif cmd == 'all':
        setup_bios()
        create_platform_folders()
        analyze_current_roms()
    elif cmd == 'cleanup-info':
        cleanup_emulator_dir()
    else:
        print("ROM整理工具")
        print("命令:")
        print("  bios        - 从Emulator目录复制BIOS文件")
        print("  folders     - 创建平台文件夹")
        print("  analyze     - 分析当前ROM文件")
        print("  move-nes    - 将NES文件移动到nes子目录")
        print("  all         - 执行所有设置")
        print("  cleanup-info - 显示Emulator目录信息")

if __name__ == '__main__':
    main()
