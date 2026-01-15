#!/usr/bin/env python3
"""
ROM单个上传脚本 - 上传到阿里云ESA KV存储
每个文件间隔1秒，避免限流
"""

import os
import sys
import base64
import json
import time
from pathlib import Path

# ============ 配置 ============
CONFIG = {
    'access_key_id': 'LTAI5t6pLMRf7Hp3oWVCo2Cn',
    'access_key_secret': 'SVvoj5jybLJ3nI5e0fqAnkCwuxKIqs',
    'namespace': 'roms',
    'roms_dir': Path(__file__).parent.parent / 'roms',
    'region': 'cn-hangzhou',
    'delay': 1,  # 每个文件间隔秒数
}

def create_client():
    from alibabacloud_esa20240910.client import Client
    from alibabacloud_tea_openapi.models import Config
    
    config = Config(
        access_key_id=CONFIG['access_key_id'],
        access_key_secret=CONFIG['access_key_secret'],
        endpoint=f"esa.{CONFIG['region']}.aliyuncs.com",
    )
    return Client(config)

def sanitize_key(name):
    """清理key名称，移除EdgeKV不支持的字符"""
    import re
    # EdgeKV key 不支持: 空格、逗号、方括号、某些特殊字符
    # 替换空格为下划线
    key = name.replace(' ', '_')
    # 移除方括号及其内容（汉化组信息）
    key = re.sub(r'\[.*?\]', '', key)
    # 移除其他特殊字符，只保留中文、字母、数字、下划线、括号、点、减号
    key = re.sub(r'[，,&!！？?\'\"]+', '', key)
    # 清理多余的下划线
    key = re.sub(r'_+', '_', key)
    key = key.strip('_')
    return key

def get_rom_files(roms_dir):
    roms_dir = Path(roms_dir)
    files = []
    
    # 平台配置 - 支持大小写文件夹名
    platforms = {
        'nes': ['.nes', '.zip'],
        'fc': ['.nes', '.zip'],  # FC = NES
        'sfc': ['.sfc', '.smc', '.zip'],
        'md': ['.md', '.bin', '.gen', '.zip'],
        'gba': ['.gba', '.zip'],
        'gbc': ['.gbc', '.gb', '.zip'],
        'n64': ['.n64', '.z64', '.v64', '.zip'],
        'pce': ['.pce', '.zip'],
        'arcade': ['.zip'],
        'mame': ['.zip'],
        'mameplus': ['.zip'],
        'wsc': ['.wsc', '.ws', '.zip'],
        'nds': ['.nds', '.zip'],
        'ps': ['.bin', '.cue', '.iso', '.pbp', '.chd', '.zip'],
        'psx': ['.bin', '.cue', '.iso', '.pbp', '.chd', '.zip'],
        'psp': ['.iso', '.cso', '.pbp', '.zip'],
        'dc': ['.cdi', '.gdi', '.chd', '.zip'],
    }
    
    # 平台名称映射（统一小写）
    platform_map = {
        'fc': 'nes',
        'mameplus': 'mame',
        'psx': 'psx',
        'ps': 'psx',
    }
    
    # 扫描各平台子目录（支持大小写）
    for subdir in roms_dir.iterdir():
        if not subdir.is_dir():
            continue
        
        folder_name = subdir.name.lower()
        if folder_name not in platforms:
            continue
        
        # 获取标准平台名
        platform = platform_map.get(folder_name, folder_name)
        extensions = platforms[folder_name]
        
        for ext in extensions:
            for f in subdir.glob(f'*{ext}'):
                if not f.is_file():
                    continue
                sanitized_name = sanitize_key(f.name)
                files.append({
                    'name': f.name,
                    'key': f'roms:{platform}:{sanitized_name}',
                    'path': str(f),
                    'size': f.stat().st_size,
                    'platform': platform,
                })
    
    # 也扫描根目录（兼容旧结构）
    for ext in ['*.zip', '*.nes']:
        for f in roms_dir.glob(ext):
            if f.is_file():
                sanitized_name = sanitize_key(f.name)
                files.append({
                    'name': f.name,
                    'key': f'roms:{sanitized_name}',
                    'path': str(f),
                    'size': f.stat().st_size,
                    'platform': 'nes',  # 默认NES
                })
    
    return files

def upload_single(client, rom):
    """上传单个文件"""
    from alibabacloud_esa20240910.models import PutKvRequest
    
    try:
        with open(rom['path'], 'rb') as f:
            content = base64.b64encode(f.read()).decode('utf-8')
        
        request = PutKvRequest(
            namespace=CONFIG['namespace'],
            key=rom['key'],
            value=content,
        )
        client.put_kv(request)
        return True, None
    except Exception as e:
        return False, str(e)[:80]

def upload_all():
    print("=== ROM单个上传 ===\n")
    print(f"命名空间: {CONFIG['namespace']}")
    print(f"间隔: {CONFIG['delay']}秒\n")
    
    rom_files = get_rom_files(CONFIG['roms_dir'])
    total = len(rom_files)
    print(f"共 {total} 个文件\n")
    
    if not rom_files:
        return
    
    client = create_client()
    success_count = 0
    failed = []
    
    for i, rom in enumerate(rom_files, 1):
        ok, err = upload_single(client, rom)
        if ok:
            success_count += 1
            print(f"[{i}/{total}] ✓ {rom['name']}")
        else:
            failed.append({'name': rom['name'], 'error': err})
            print(f"[{i}/{total}] ✗ {rom['name']}: {err}")
        
        if i < total:
            time.sleep(CONFIG['delay'])
    
    print(f"\n{'='*50}")
    print(f"完成! 成功: {success_count}, 失败: {len(failed)}")
    
    if failed:
        with open('upload-failed.json', 'w', encoding='utf-8') as f:
            json.dump(failed, f, ensure_ascii=False, indent=2)
        print("失败列表已保存到 upload-failed.json")

def retry_failed():
    print("=== 重试失败文件 ===\n")
    
    try:
        with open('upload-failed.json', 'r', encoding='utf-8') as f:
            failed_data = json.load(f)
    except FileNotFoundError:
        print("没有 upload-failed.json")
        return
    
    if not failed_data:
        print("没有需要重试的文件")
        return
    
    failed_names = set(item['name'] for item in failed_data)
    rom_files = get_rom_files(CONFIG['roms_dir'])
    retry_files = [r for r in rom_files if r['name'] in failed_names]
    
    total = len(retry_files)
    print(f"重试 {total} 个文件\n")
    
    client = create_client()
    success_count = 0
    still_failed = []
    
    for i, rom in enumerate(retry_files, 1):
        ok, err = upload_single(client, rom)
        if ok:
            success_count += 1
            print(f"[{i}/{total}] ✓ {rom['name']}")
        else:
            still_failed.append({'name': rom['name'], 'error': err})
            print(f"[{i}/{total}] ✗ {rom['name']}: {err}")
        
        if i < total:
            time.sleep(CONFIG['delay'])
    
    print(f"\n完成! 成功: {success_count}, 失败: {len(still_failed)}")
    
    if still_failed:
        with open('upload-failed.json', 'w', encoding='utf-8') as f:
            json.dump(still_failed, f, ensure_ascii=False, indent=2)
    else:
        os.remove('upload-failed.json')
        print("全部成功!")

def test_api():
    from alibabacloud_esa20240910.models import PutKvRequest
    
    print("=== 测试API ===\n")
    client = create_client()
    
    try:
        request = PutKvRequest(
            namespace=CONFIG['namespace'],
            key='test:hello',
            value=base64.b64encode(b'hello').decode('utf-8'),
        )
        client.put_kv(request)
        print("写入成功!")
    except Exception as e:
        print(f"失败: {e}")

def list_kv():
    from alibabacloud_esa20240910.models import ListKvsRequest
    
    print("=== 列出KV ===\n")
    client = create_client()
    
    try:
        request = ListKvsRequest(namespace=CONFIG['namespace'], prefix='roms:')
        response = client.list_kvs(request)
        
        if response.body and response.body.keys:
            keys = response.body.keys
            print(f"找到 {len(keys)} 个:")
            for key in keys[:30]:
                print(f"  {key.name}")
            if len(keys) > 30:
                print(f"  ... 还有 {len(keys) - 30} 个")
        else:
            print("没有找到")
    except Exception as e:
        print(f"错误: {e}")

def generate_manifest():
    """生成游戏列表manifest文件"""
    print("=== 生成 roms-manifest.json ===\n")
    
    rom_files = get_rom_files(CONFIG['roms_dir'])
    total_size = sum(r['size'] for r in rom_files)
    
    # 按平台分组统计
    platform_stats = {}
    for r in rom_files:
        p = r.get('platform', 'nes')
        platform_stats[p] = platform_stats.get(p, 0) + 1
    
    # manifest中保存原始名称、key和平台
    manifest = {
        'total': len(rom_files),
        'total_size': total_size,
        'platforms': platform_stats,
        'files': [{
            'name': r['name'],
            'key': r['key'],
            'size': r['size'],
            'platform': r.get('platform', 'nes')
        } for r in rom_files],
    }
    
    manifest_path = Path(__file__).parent.parent / 'roms-manifest.json'
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    
    print(f"共 {len(rom_files)} 个游戏")
    print(f"总大小: {total_size / 1024 / 1024:.1f} MB")
    print("平台分布:")
    for p, count in sorted(platform_stats.items()):
        print(f"  {p}: {count}")
    print(f"已保存到: {manifest_path}")

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'help'
    
    if cmd == 'upload':
        upload_all()
    elif cmd == 'retry':
        retry_failed()
    elif cmd == 'test':
        test_api()
    elif cmd == 'list':
        list_kv()
    elif cmd == 'manifest':
        generate_manifest()
    else:
        print("命令: upload | retry | test | list | manifest")

if __name__ == '__main__':
    main()
