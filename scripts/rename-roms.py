#!/usr/bin/env python3
"""
批量重命名 ROM 文件，去掉中括号及其内容
同时更新 roms-manifest.json
"""

import os
import re
import json
import shutil

# ROM 目录
ROMS_DIR = "roms/nes"
MANIFEST_FILE = "roms-manifest.json"

def clean_filename(filename):
    """
    清理文件名，去掉中括号及其内容
    例如: "超级魂斗罗X [孔雀天汉化].nes" -> "超级魂斗罗X.nes"
    """
    # 获取扩展名
    name, ext = os.path.splitext(filename)
    
    # 去掉所有 [xxx] 内容（包括前面的空格）
    cleaned = re.sub(r'\s*\[[^\]]*\]', '', name)
    
    # 去掉多余的空格
    cleaned = cleaned.strip()
    
    # 如果清理后为空，保留原名
    if not cleaned:
        return filename
    
    return cleaned + ext

def main():
    # 检查目录是否存在
    if not os.path.exists(ROMS_DIR):
        print(f"错误: 目录 {ROMS_DIR} 不存在")
        return
    
    # 读取 manifest
    manifest = None
    if os.path.exists(MANIFEST_FILE):
        with open(MANIFEST_FILE, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
    
    # 记录重命名映射
    rename_map = {}
    skipped = []
    conflicts = []
    
    # 遍历所有文件
    files = os.listdir(ROMS_DIR)
    print(f"找到 {len(files)} 个文件")
    
    for filename in files:
        if not filename.endswith(('.nes', '.NES', '.zip', '.ZIP')):
            continue
        
        # 检查是否包含中括号
        if '[' not in filename:
            continue
        
        old_path = os.path.join(ROMS_DIR, filename)
        new_filename = clean_filename(filename)
        new_path = os.path.join(ROMS_DIR, new_filename)
        
        # 如果新旧文件名相同，跳过
        if filename == new_filename:
            skipped.append(filename)
            continue
        
        # 检查目标文件是否已存在
        if os.path.exists(new_path):
            conflicts.append((filename, new_filename))
            continue
        
        rename_map[filename] = new_filename
    
    # 显示预览
    print(f"\n将重命名 {len(rename_map)} 个文件:")
    print("-" * 60)
    
    for old, new in list(rename_map.items())[:20]:
        print(f"  {old}")
        print(f"  -> {new}")
        print()
    
    if len(rename_map) > 20:
        print(f"  ... 还有 {len(rename_map) - 20} 个文件")
    
    if conflicts:
        print(f"\n⚠️ 有 {len(conflicts)} 个文件存在冲突（目标文件已存在）:")
        for old, new in conflicts[:10]:
            print(f"  {old} -> {new}")
    
    # 确认执行
    print("\n" + "=" * 60)
    confirm = input("确认执行重命名? (yes/no): ")
    
    if confirm.lower() != 'yes':
        print("已取消")
        return
    
    # 执行重命名
    success = 0
    failed = 0
    
    for old_name, new_name in rename_map.items():
        old_path = os.path.join(ROMS_DIR, old_name)
        new_path = os.path.join(ROMS_DIR, new_name)
        
        try:
            os.rename(old_path, new_path)
            success += 1
            print(f"✓ {old_name} -> {new_name}")
        except Exception as e:
            failed += 1
            print(f"✗ {old_name}: {e}")
    
    print(f"\n重命名完成: 成功 {success}, 失败 {failed}")
    
    # 更新 manifest
    if manifest and success > 0:
        print("\n更新 manifest...")
        
        updated = 0
        for item in manifest.get('files', []):
            old_name = item.get('name', '')
            if old_name in rename_map:
                new_name = rename_map[old_name]
                item['name'] = new_name
                # 更新 key（去掉中括号内容）
                old_key = item.get('key', '')
                # key 格式: roms:nes:xxx.nes
                if old_key:
                    key_name = old_key.split(':')[-1]
                    new_key_name = re.sub(r'_?\[[^\]]*\]', '', key_name)
                    new_key_name = re.sub(r'_+', '_', new_key_name)  # 合并多个下划线
                    new_key_name = new_key_name.strip('_')
                    item['key'] = ':'.join(old_key.split(':')[:-1]) + ':' + new_key_name
                updated += 1
        
        # 保存 manifest
        with open(MANIFEST_FILE, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        
        print(f"已更新 {updated} 条记录")

if __name__ == '__main__':
    main()
