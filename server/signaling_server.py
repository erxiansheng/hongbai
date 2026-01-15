#!/usr/bin/env python3
"""
游戏联机信令服务器 - 纯后端版本
- 只提供 WebSocket 信令服务 (端口 8765)
- 不提供 HTTP 静态文件服务
- 前端需要单独部署
"""

import asyncio
import json
import uuid
import random
import os
from datetime import datetime, timedelta
from typing import Dict, Optional
from dataclasses import dataclass, field

try:
    import websockets
    from websockets.server import WebSocketServerProtocol
except ImportError:
    print("=" * 50)
    print("错误: 未安装 websockets 库")
    print("请运行: pip install websockets")
    print("=" * 50)
    exit(1)

# ============ 配置 ============
WS_PORT = 8765      # WebSocket 信令端口


# ============ 数据结构 ============
@dataclass
class Player:
    ws: WebSocketServerProtocol
    player_num: int
    name: str = ""
    peer_id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    joined_at: datetime = field(default_factory=datetime.now)


@dataclass
class Room:
    code: str
    players: Dict[int, Player] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)
    max_players: int = 4

    def is_full(self) -> bool:
        return len(self.players) >= self.max_players

    def get_next_player_num(self) -> Optional[int]:
        for i in range(2, self.max_players + 1):
            if i not in self.players:
                return i
        return None

    def get_players_info(self) -> list:
        return [{"playerNum": p.player_num, "name": p.name} for p in self.players.values()]


# ============ 信令服务器 ============
class SignalingServer:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}
        self.ws_to_room: Dict[WebSocketServerProtocol, tuple] = {}

    def generate_room_code(self) -> str:
        chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        for _ in range(100):
            code = ''.join(random.choice(chars) for _ in range(6))
            if code not in self.rooms:
                return code
        raise Exception("无法生成房间号")

    async def handle_connection(self, ws: WebSocketServerProtocol):
        """处理 WebSocket 连接（兼容新版 websockets 库）"""
        print(f"[WS] 新连接: {ws.remote_address}")
        try:
            async for message in ws:
                await self.handle_message(ws, message)
        except websockets.exceptions.ConnectionClosed:
            pass
        except websockets.exceptions.InvalidMessage:
            # 忽略无效的 HTTP 请求（通常是浏览器预检或错误连接）
            pass
        except Exception as e:
            # 忽略常见的连接错误
            error_str = str(e).lower()
            if 'eof' not in error_str and 'connection' not in error_str:
                print(f"[WS错误] {e}")
        finally:
            await self.handle_disconnect(ws)

    async def handle_message(self, ws: WebSocketServerProtocol, message: str):
        try:
            data = json.loads(message)
            msg_type = data.get('type')

            handlers = {
                'create': self.handle_create,
                'join': self.handle_join,
                'leave': self.handle_leave,
                'signal': self.handle_signal,
                'rejoin': self.handle_rejoin,
            }

            handler = handlers.get(msg_type)
            if handler:
                await handler(ws, data)
            else:
                await self.send(ws, {'type': 'error', 'message': f'未知类型: {msg_type}'})

        except json.JSONDecodeError:
            await self.send(ws, {'type': 'error', 'message': '无效JSON'})
        except Exception as e:
            print(f"[错误] {e}")
            await self.send(ws, {'type': 'error', 'message': str(e)})

    async def handle_create(self, ws, data):
        if ws in self.ws_to_room:
            await self.send(ws, {'type': 'error', 'message': '已在房间中'})
            return

        room_code = self.generate_room_code()
        room = Room(code=room_code)
        player = Player(ws=ws, player_num=1, name=data.get('name', '房主'))
        room.players[1] = player

        self.rooms[room_code] = room
        self.ws_to_room[ws] = (room_code, 1)

        await self.send(ws, {
            'type': 'created',
            'roomCode': room_code,
            'playerNum': 1,
            'peerId': player.peer_id
        })
        print(f"[房间] 创建: {room_code}")

    async def handle_join(self, ws, data):
        room_code = data.get('roomCode', '').upper().strip()

        if not room_code or room_code not in self.rooms:
            await self.send(ws, {'type': 'error', 'message': '房间不存在'})
            return

        room = self.rooms[room_code]
        if room.is_full():
            await self.send(ws, {'type': 'error', 'message': '房间已满'})
            return

        if ws in self.ws_to_room:
            await self.send(ws, {'type': 'error', 'message': '已在房间中'})
            return

        player_num = room.get_next_player_num()
        player = Player(ws=ws, player_num=player_num, name=data.get('name', f'玩家{player_num}'))
        room.players[player_num] = player
        self.ws_to_room[ws] = (room_code, player_num)

        await self.send(ws, {
            'type': 'joined',
            'roomCode': room_code,
            'playerNum': player_num,
            'peerId': player.peer_id,
            'players': room.get_players_info()
        })

        for other_num, other in room.players.items():
            if other_num != player_num:
                await self.send(other.ws, {
                    'type': 'player-joined',
                    'playerNum': player_num,
                    'name': player.name
                })

        print(f"[房间] P{player_num} 加入 {room_code}")

    async def handle_leave(self, ws, data=None):
        await self.handle_disconnect(ws)

    async def handle_signal(self, ws, data):
        if ws not in self.ws_to_room:
            return

        room_code, from_player = self.ws_to_room[ws]
        to_player = data.get('toPlayer')
        signal_data = data.get('data', {})

        if room_code in self.rooms:
            room = self.rooms[room_code]
            if to_player in room.players:
                await self.send(room.players[to_player].ws, {
                    'type': 'signal',
                    'fromPlayer': from_player,
                    'data': signal_data
                })

    async def handle_rejoin(self, ws, data):
        room_code = data.get('roomCode', '').upper()
        player_num = data.get('playerNum')

        if room_code not in self.rooms:
            await self.send(ws, {'type': 'error', 'message': '房间不存在'})
            return

        room = self.rooms[room_code]
        if player_num in room.players:
            old_ws = room.players[player_num].ws
            if old_ws in self.ws_to_room:
                del self.ws_to_room[old_ws]

            room.players[player_num].ws = ws
            self.ws_to_room[ws] = (room_code, player_num)

            await self.send(ws, {
                'type': 'rejoined',
                'roomCode': room_code,
                'playerNum': player_num,
                'players': room.get_players_info()
            })
            print(f"[房间] P{player_num} 重连 {room_code}")

    async def handle_disconnect(self, ws):
        if ws not in self.ws_to_room:
            return

        room_code, player_num = self.ws_to_room[ws]
        del self.ws_to_room[ws]

        if room_code not in self.rooms:
            return

        room = self.rooms[room_code]
        if player_num in room.players:
            del room.players[player_num]

        for other in room.players.values():
            await self.send(other.ws, {'type': 'player-left', 'playerNum': player_num})

        if player_num == 1:
            for other in list(room.players.values()):
                await self.send(other.ws, {'type': 'room-closed', 'message': '房主离开'})
                if other.ws in self.ws_to_room:
                    del self.ws_to_room[other.ws]
            del self.rooms[room_code]
            print(f"[房间] {room_code} 关闭")
        elif len(room.players) == 0:
            del self.rooms[room_code]

    async def send(self, ws, data):
        try:
            # 兼容新旧版本的 websockets 库
            is_open = getattr(ws, 'open', None)
            if is_open is None:
                # 新版本使用 state
                from websockets.protocol import State
                is_open = ws.state == State.OPEN
            
            if is_open:
                msg = json.dumps(data)
                print(f"[发送] {msg[:100]}...")  # 调试日志
                await ws.send(msg)
        except Exception as e:
            print(f"[发送错误] {e}")

    async def cleanup_task(self):
        while True:
            await asyncio.sleep(300)
            now = datetime.now()
            stale = [c for c, r in self.rooms.items()
                     if len(r.players) == 0 and (now - r.created_at) > timedelta(hours=1)]
            for code in stale:
                del self.rooms[code]
                print(f"[清理] {code}")


# ============ 主函数 ============
async def main():
    print("=" * 60)
    print("  🎮 游戏联机信令服务器 (纯后端)")
    print("=" * 60)
    print(f"  WebSocket: ws://0.0.0.0:{WS_PORT}")


    # 启动信令服务器
    signaling = SignalingServer()
    asyncio.create_task(signaling.cleanup_task())

    # 自定义错误处理器，抑制无效连接的警告
    async def process_request(path, request_headers):
        # 允许所有 WebSocket 连接
        return None

    ws_server = await websockets.serve(
        signaling.handle_connection,
        "0.0.0.0",
        WS_PORT,
        ping_interval=30,
        ping_timeout=10,
        process_request=process_request
    )

    print(f"[启动] 信令服务器已启动")
    print(f"  监听端口: {WS_PORT}")
    print()

    # 保持运行
    await ws_server.wait_closed()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[停止] 服务器已停止")
