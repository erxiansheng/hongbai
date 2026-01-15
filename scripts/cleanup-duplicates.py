#!/usr/bin/env python3
"""
清理重复汉化NES文件脚本
识别同一游戏的多个汉化版本，只保留一个
"""

import os
import re
import json
from pathlib import Path
from collections import defaultdict

ROMS_DIR = Path(__file__).parent.parent / 'roms'

def extract_game_name(filename):
    """提取游戏基础名称（去除汉化组信息和版本号）"""
    name = filename
    # 移除扩展名
    name = re.sub(r'\.(nes|NES)$', '', name)
    # 移除方括号内的汉化组信息
    name = re.sub(r'\s*\[.*?\]', '', name)
    # 移除圆括号内的版本信息
    name = re.sub(r'\s*\(.*?\)', '', name)
    # 清理多余空格
    name = name.strip()
    return name

def find_duplicates():
    """找出重复的汉化文件"""
    games = defaultdict(list)
    
    for f in ROMS_DIR.glob('*.nes'):
        base_name = extract_game_name(f.name)
        games[base_name].append(f.name)
    
    for f in ROMS_DIR.glob('*.NES'):
        base_name = extract_game_name(f.name)
        # 避免重复添加（大小写不同的情况）
        if f.name not in games[base_name]:
            games[base_name].append(f.name)
    
    # 只返回有多个版本的游戏
    duplicates = {k: v for k, v in games.items() if len(v) > 1}
    return duplicates

def select_best_version(versions):
    """选择最佳版本（优先选择简体中文、完美汉化、修正版等）"""
    priority_keywords = [
        '简体', '完美', '修正', 'MS修正', 'MS汉化', '九班汉化', 
        '星空汉化', 'Nokoh汉化', '外星科技', '南晶科技'
    ]
    
    # 按优先级排序
    def score(name):
        s = 0
        for i, kw in enumerate(priority_keywords):
            if kw in name:
                s += (len(priority_keywords) - i) * 10
        # 优先选择较新版本（版本号较高）
        version_match = re.search(r'v(\d+\.?\d*)', name)
        if version_match:
            s += float(version_match.group(1))
        return s
    
    sorted_versions = sorted(versions, key=score, reverse=True)
    return sorted_versions[0]

def main():
    print("=== 查找重复汉化NES文件 ===\n")
    
    duplicates = find_duplicates()
    
    if not duplicates:
        print("没有找到重复的汉化文件")
        return
    
    print(f"找到 {len(duplicates)} 组重复游戏:\n")
    
    to_delete = []
    to_keep = []
    
    for game_name, versions in sorted(duplicates.items()):
        print(f"【{game_name}】({len(versions)} 个版本)")
        best = select_best_version(versions)
        for v in versions:
            if v == best:
                print(f"  ✓ 保留: {v}")
                to_keep.append(v)
            else:
                print(f"  ✗ 删除: {v}")
                to_delete.append(v)
        print()
    
    print(f"\n总计: 保留 {len(to_keep)} 个, 删除 {len(to_delete)} 个")
    
    # 保存删除列表
    with open('duplicates-to-delete.json', 'w', encoding='utf-8') as f:
        json.dump({
            'to_delete': to_delete,
            'to_keep': to_keep,
            'duplicates': duplicates
        }, f, ensure_ascii=False, indent=2)
    
    print("\n删除列表已保存到 duplicates-to-delete.json")
    print("运行 'python scripts/cleanup-duplicates.py delete' 执行删除")

def do_delete():
    """执行删除操作"""
    try:
        with open('duplicates-to-delete.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print("请先运行脚本生成删除列表")
        return
    
    to_delete = data['to_delete']
    print(f"=== 删除 {len(to_delete)} 个重复文件 ===\n")
    
    deleted = 0
    for name in to_delete:
        path = ROMS_DIR / name
        if path.exists():
            path.unlink()
            print(f"✓ 已删除: {name}")
            deleted += 1
        else:
            print(f"✗ 文件不存在: {name}")
    
    print(f"\n完成! 删除了 {deleted} 个文件")
    
    # 删除临时文件
    os.remove('duplicates-to-delete.json')

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == 'delete':
        do_delete()
    else:
        main()
