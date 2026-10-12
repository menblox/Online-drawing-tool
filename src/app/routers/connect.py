from fastapi import WebSocket, WebSocketDisconnect, APIRouter

router = APIRouter(
    tags=["Connect page"]
)

MAX_HISTORY = 1000

class Room:
    def __init__(self):
        self.connections: list[WebSocket] = []
        self.messages: list[str] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.connections.append(ws)
        for msg in self.messages:
            try:
                await ws.send_text(msg)
            except Exception:
                break

    async def disconnect(self, ws: WebSocket):
        if ws in self.connections:
            self.connections.remove(ws)

    async def broadcast(self, message: str, sender: WebSocket = None):
        self.messages.append(message)
        if len(self.messages) > MAX_HISTORY:
            self.messages.pop(0)

        for ws in list(self.connections):
            if ws != sender:
                try:
                    await ws.send_text(message)
                except Exception:
                    pass

rooms: dict[str, Room] = {}

@router.websocket("/ws/{room_id}")
async def connect_page(ws: WebSocket, room_id: str):
    room = rooms.setdefault(room_id, Room())
    await room.connect(ws)

    try:
        while True:
            data = await ws.receive_text()
            await room.broadcast(data, sender=ws)
    except WebSocketDisconnect:
        await room.disconnect(ws)
