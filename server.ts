import express from "express";
import http from "http";
import path from "path";
import os from "os";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";

const app = express();
const server = http.createServer(app);
const PORT = 3000;

app.use(express.json());

// API to return local network IP for TV QR codes and physical phone controllers
app.get("/api/host-info", (req, res) => {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (netList) {
      for (const net of netList) {
        // Skip over internal (i.e. 127.0.0.1) and non-IPv4 addresses
        if (net.family === "IPv4" && !net.internal) {
          addresses.push(net.address);
        }
      }
    }
  }

  res.json({
    port: PORT,
    localIps: addresses,
    recommendedIp: addresses[0] || "localhost",
  });
});

interface PlayerSession {
  slot: number; // 1..4
  id: string;
  name: string;
  team: string; // 'RED' | 'BLUE' | 'GREEN'
  ready: boolean;
  ws: WebSocket;
  lastPing: number;
}

interface Room {
  code: string;
  tvWs: WebSocket | null;
  players: Map<number, PlayerSession>;
  matchState: "LOBBY" | "COUNTDOWN" | "PLAYING" | "ENDED";
  createdAt: number;
}

const rooms = new Map<string, Room>();

// Clean up stale rooms periodically (older than 6 hours)
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.createdAt > 6 * 3600 * 1000 && (!room.tvWs || room.players.size === 0)) {
      rooms.delete(code);
    }
  }
}, 60000);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    rooms: rooms.size,
    timestamp: Date.now(),
  });
});

app.get("/api/room/:code", (req, res) => {
  const code = req.params.code.toUpperCase().trim();
  const room = rooms.get(code);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const occupiedSlots = Array.from(room.players.values()).map((p) => ({
    slot: p.slot,
    name: p.name,
    team: p.team,
    ready: p.ready,
  }));

  res.json({
    code: room.code,
    active: !!room.tvWs,
    playerCount: room.players.size,
    matchState: room.matchState,
    players: occupiedSlots,
  });
});

// WebSocket Handling
const wss = new WebSocketServer({ server, path: "/ws" });

function generateRoomCode(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

wss.on("connection", (ws: WebSocket) => {
  let boundRoomCode: string | null = null;
  let boundRole: "tv" | "phone" | null = null;
  let boundSlot: number | null = null;
  let playerId: string | null = null;

  const safeSend = (targetWs: WebSocket | null | undefined, data: any) => {
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      try {
        targetWs.send(JSON.stringify(data));
      } catch (err) {
        console.error("WS send error:", err);
      }
    }
  };

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const type = msg.type;

      // TV: Create or Claim Room
      if (type === "tv:create_room") {
        let code = (msg.code || generateRoomCode()).toUpperCase().trim();
        while (rooms.has(code) && rooms.get(code)?.tvWs && rooms.get(code)?.tvWs !== ws) {
          code = generateRoomCode();
        }

        let room = rooms.get(code);
        if (!room) {
          room = {
            code,
            tvWs: ws,
            players: new Map(),
            matchState: "LOBBY",
            createdAt: Date.now(),
          };
          rooms.set(code, room);
        } else {
          room.tvWs = ws;
        }

        boundRoomCode = code;
        boundRole = "tv";

        safeSend(ws, {
          type: "tv:room_created",
          code,
          players: Array.from(room.players.values()).map((p) => ({
            slot: p.slot,
            id: p.id,
            name: p.name,
            team: p.team,
            ready: p.ready,
          })),
        });
        return;
      }

      // Phone: Join Room
      if (type === "phone:join_room") {
        const code = (msg.code || "").toUpperCase().trim();
        const room = rooms.get(code);

        if (!room || !room.tvWs || room.tvWs.readyState !== WebSocket.OPEN) {
          safeSend(ws, {
            type: "join:error",
            message: "Room not found or TV is currently inactive. Verify code!",
          });
          return;
        }

        // Check if reconnecting existing player
        const incomingId = msg.playerId;
        let existingSlot: number | null = null;

        if (incomingId) {
          for (const [s, p] of room.players.entries()) {
            if (p.id === incomingId) {
              existingSlot = s;
              break;
            }
          }
        }

        let targetSlot = existingSlot;
        if (targetSlot === null) {
          // Find next available slot from 1 to 4
          for (let i = 1; i <= 4; i++) {
            if (!room.players.has(i)) {
              targetSlot = i;
              break;
            }
          }
        }

        if (targetSlot === null) {
          safeSend(ws, {
            type: "join:error",
            message: "Room is full (Maximum 4 players).",
          });
          return;
        }

        const teamDefaults = ["RED", "BLUE", "GREEN", "RED"];
        const pId = incomingId || `player_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const pName = msg.name || `Player ${targetSlot}`;
        const pTeam = msg.team || teamDefaults[targetSlot - 1];

        const session: PlayerSession = {
          slot: targetSlot,
          id: pId,
          name: pName,
          team: pTeam,
          ready: false,
          ws,
          lastPing: Date.now(),
        };

        room.players.set(targetSlot, session);
        boundRoomCode = code;
        boundRole = "phone";
        boundSlot = targetSlot;
        playerId = pId;

        // Confirm to phone
        safeSend(ws, {
          type: "join:success",
          code,
          slot: targetSlot,
          playerId: pId,
          name: pName,
          team: pTeam,
          matchState: room.matchState,
        });

        // Notify TV
        safeSend(room.tvWs, {
          type: "player:joined",
          slot: targetSlot,
          id: pId,
          name: pName,
          team: pTeam,
          ready: false,
        });

        // Broadcast to other players in room about roster update
        const roster = Array.from(room.players.values()).map((p) => ({
          slot: p.slot,
          id: p.id,
          name: p.name,
          team: p.team,
          ready: p.ready,
        }));

        for (const p of room.players.values()) {
          safeSend(p.ws, {
            type: "room:roster",
            players: roster,
            matchState: room.matchState,
          });
        }
        return;
      }

      // Route Phone Inputs to TV immediately
      if (type === "phone:input" && boundRoomCode && boundSlot !== null) {
        const room = rooms.get(boundRoomCode);
        if (room && room.tvWs) {
          safeSend(room.tvWs, {
            type: "player:input",
            slot: boundSlot,
            inputs: msg.inputs,
            seq: msg.seq,
          });
        }
        return;
      }

      // Phone update profile (name, team, ready)
      if (type === "phone:update_profile" && boundRoomCode && boundSlot !== null) {
        const room = rooms.get(boundRoomCode);
        if (room) {
          const player = room.players.get(boundSlot);
          if (player) {
            if (msg.name) player.name = String(msg.name).slice(0, 16);
            if (msg.team) player.team = msg.team;
            if (typeof msg.ready === "boolean") player.ready = msg.ready;

            safeSend(room.tvWs, {
              type: "player:updated",
              slot: boundSlot,
              name: player.name,
              team: player.team,
              ready: player.ready,
            });

            // Echo back to phone
            safeSend(player.ws, {
              type: "profile:updated",
              name: player.name,
              team: player.team,
              ready: player.ready,
            });
          }
        }
        return;
      }

      // TV Host controls: edit player
      if (type === "tv:update_player" && boundRoomCode && boundRole === "tv") {
        const room = rooms.get(boundRoomCode);
        if (room) {
          const player = room.players.get(msg.slot);
          if (player) {
            if (msg.name) player.name = String(msg.name).slice(0, 16);
            if (msg.team) player.team = msg.team;
            safeSend(player.ws, {
              type: "profile:updated",
              name: player.name,
              team: player.team,
              ready: player.ready,
            });
            safeSend(room.tvWs, {
              type: "player:updated",
              slot: player.slot,
              name: player.name,
              team: player.team,
              ready: player.ready,
            });
          }
        }
        return;
      }

      // TV Host controls: kick player
      if (type === "tv:kick_player" && boundRoomCode && boundRole === "tv") {
        const room = rooms.get(boundRoomCode);
        if (room) {
          const player = room.players.get(msg.slot);
          if (player) {
            safeSend(player.ws, {
              type: "kicked",
              reason: "Removed by TV host.",
            });
            room.players.delete(msg.slot);
            safeSend(room.tvWs, {
              type: "player:left",
              slot: msg.slot,
            });
          }
        }
        return;
      }

      // TV sync match state to phones (LOBBY, COUNTDOWN, PLAYING, ENDED)
      if (type === "tv:match_state" && boundRoomCode && boundRole === "tv") {
        const room = rooms.get(boundRoomCode);
        if (room) {
          room.matchState = msg.matchState;
          for (const p of room.players.values()) {
            safeSend(p.ws, {
              type: "match:state",
              matchState: msg.matchState,
              winnerTeam: msg.winnerTeam,
              winnerNames: msg.winnerNames,
              countdown: msg.countdown,
            });
          }
        }
        return;
      }

      // TV sending haptic / feedback events to specific phone
      if (type === "tv:phone_haptic" && boundRoomCode && boundRole === "tv") {
        const room = rooms.get(boundRoomCode);
        if (room) {
          const p = room.players.get(msg.slot);
          if (p) {
            safeSend(p.ws, {
              type: "haptic",
              effect: msg.effect, // 'hit' | 'eliminated' | 'fire' | 'shield'
              hp: msg.hp,
              maxHp: msg.maxHp,
              shieldRemaining: msg.shieldRemaining,
              shieldCooldown: msg.shieldCooldown,
              weapon: msg.weapon,
            });
          }
        }
        return;
      }

      // Ping for real-time latency verification
      if (type === "ping") {
        safeSend(ws, { type: "pong", clientTime: msg.clientTime, serverTime: Date.now() });
      }
    } catch (e) {
      console.error("WS message handling error:", e);
    }
  });

  ws.on("close", () => {
    if (boundRoomCode) {
      const room = rooms.get(boundRoomCode);
      if (room) {
        if (boundRole === "tv" && room.tvWs === ws) {
          room.tvWs = null;
          // Notify connected phones
          for (const p of room.players.values()) {
            safeSend(p.ws, {
              type: "tv:disconnected",
              message: "TV host disconnected. Waiting for host to return...",
            });
          }
        } else if (boundRole === "phone" && boundSlot !== null) {
          room.players.delete(boundSlot);
          if (room.tvWs) {
            safeSend(room.tvWs, {
              type: "player:left",
              slot: boundSlot,
            });
          }
          // Notify other phones of updated roster
          const roster = Array.from(room.players.values()).map((p) => ({
            slot: p.slot,
            id: p.id,
            name: p.name,
            team: p.team,
            ready: p.ready,
          }));
          for (const p of room.players.values()) {
            safeSend(p.ws, {
              type: "room:roster",
              players: roster,
              matchState: room.matchState,
            });
          }
        }
      }
    }
  });
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Neo Strike 2D server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
