var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_http = __toESM(require("http"), 1);
var import_path = __toESM(require("path"), 1);
var import_os = __toESM(require("os"), 1);
var import_ws = require("ws");
var import_vite = require("vite");
var app = (0, import_express.default)();
var server = import_http.default.createServer(app);
var PORT = 3e3;
app.use(import_express.default.json());
app.get("/api/host-info", (req, res) => {
  const interfaces = import_os.default.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (netList) {
      for (const net of netList) {
        if (net.family === "IPv4" && !net.internal) {
          addresses.push(net.address);
        }
      }
    }
  }
  res.json({
    port: PORT,
    localIps: addresses,
    recommendedIp: addresses[0] || "localhost"
  });
});
var rooms = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.createdAt > 6 * 3600 * 1e3 && (!room.tvWs || room.players.size === 0)) {
      rooms.delete(code);
    }
  }
}, 6e4);
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    rooms: rooms.size,
    timestamp: Date.now()
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
    ready: p.ready
  }));
  res.json({
    code: room.code,
    active: !!room.tvWs,
    playerCount: room.players.size,
    matchState: room.matchState,
    players: occupiedSlots
  });
});
var wss = new import_ws.WebSocketServer({ server, path: "/ws" });
function generateRoomCode() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
wss.on("connection", (ws) => {
  let boundRoomCode = null;
  let boundRole = null;
  let boundSlot = null;
  let playerId = null;
  const safeSend = (targetWs, data) => {
    if (targetWs && targetWs.readyState === import_ws.WebSocket.OPEN) {
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
            players: /* @__PURE__ */ new Map(),
            matchState: "LOBBY",
            createdAt: Date.now()
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
            ready: p.ready
          }))
        });
        return;
      }
      if (type === "phone:join_room") {
        const code = (msg.code || "").toUpperCase().trim();
        const room = rooms.get(code);
        if (!room || !room.tvWs || room.tvWs.readyState !== import_ws.WebSocket.OPEN) {
          safeSend(ws, {
            type: "join:error",
            message: "Room not found or TV is currently inactive. Verify code!"
          });
          return;
        }
        const incomingId = msg.playerId;
        let existingSlot = null;
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
            message: "Room is full (Maximum 4 players)."
          });
          return;
        }
        const teamDefaults = ["RED", "BLUE", "GREEN", "RED"];
        const pId = incomingId || `player_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const pName = msg.name || `Player ${targetSlot}`;
        const pTeam = msg.team || teamDefaults[targetSlot - 1];
        const session = {
          slot: targetSlot,
          id: pId,
          name: pName,
          team: pTeam,
          ready: false,
          ws,
          lastPing: Date.now()
        };
        room.players.set(targetSlot, session);
        boundRoomCode = code;
        boundRole = "phone";
        boundSlot = targetSlot;
        playerId = pId;
        safeSend(ws, {
          type: "join:success",
          code,
          slot: targetSlot,
          playerId: pId,
          name: pName,
          team: pTeam,
          matchState: room.matchState
        });
        safeSend(room.tvWs, {
          type: "player:joined",
          slot: targetSlot,
          id: pId,
          name: pName,
          team: pTeam,
          ready: false
        });
        const roster = Array.from(room.players.values()).map((p) => ({
          slot: p.slot,
          id: p.id,
          name: p.name,
          team: p.team,
          ready: p.ready
        }));
        for (const p of room.players.values()) {
          safeSend(p.ws, {
            type: "room:roster",
            players: roster,
            matchState: room.matchState
          });
        }
        return;
      }
      if (type === "phone:input" && boundRoomCode && boundSlot !== null) {
        const room = rooms.get(boundRoomCode);
        if (room && room.tvWs) {
          safeSend(room.tvWs, {
            type: "player:input",
            slot: boundSlot,
            inputs: msg.inputs,
            seq: msg.seq
          });
        }
        return;
      }
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
              ready: player.ready
            });
            safeSend(player.ws, {
              type: "profile:updated",
              name: player.name,
              team: player.team,
              ready: player.ready
            });
          }
        }
        return;
      }
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
              ready: player.ready
            });
            safeSend(room.tvWs, {
              type: "player:updated",
              slot: player.slot,
              name: player.name,
              team: player.team,
              ready: player.ready
            });
          }
        }
        return;
      }
      if (type === "tv:kick_player" && boundRoomCode && boundRole === "tv") {
        const room = rooms.get(boundRoomCode);
        if (room) {
          const player = room.players.get(msg.slot);
          if (player) {
            safeSend(player.ws, {
              type: "kicked",
              reason: "Removed by TV host."
            });
            room.players.delete(msg.slot);
            safeSend(room.tvWs, {
              type: "player:left",
              slot: msg.slot
            });
          }
        }
        return;
      }
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
              countdown: msg.countdown
            });
          }
        }
        return;
      }
      if (type === "tv:phone_haptic" && boundRoomCode && boundRole === "tv") {
        const room = rooms.get(boundRoomCode);
        if (room) {
          const p = room.players.get(msg.slot);
          if (p) {
            safeSend(p.ws, {
              type: "haptic",
              effect: msg.effect,
              // 'hit' | 'eliminated' | 'fire' | 'shield'
              hp: msg.hp,
              maxHp: msg.maxHp,
              shieldRemaining: msg.shieldRemaining,
              shieldCooldown: msg.shieldCooldown,
              weapon: msg.weapon
            });
          }
        }
        return;
      }
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
          for (const p of room.players.values()) {
            safeSend(p.ws, {
              type: "tv:disconnected",
              message: "TV host disconnected. Waiting for host to return..."
            });
          }
        } else if (boundRole === "phone" && boundSlot !== null) {
          room.players.delete(boundSlot);
          if (room.tvWs) {
            safeSend(room.tvWs, {
              type: "player:left",
              slot: boundSlot
            });
          }
          const roster = Array.from(room.players.values()).map((p) => ({
            slot: p.slot,
            id: p.id,
            name: p.name,
            team: p.team,
            ready: p.ready
          }));
          for (const p of room.players.values()) {
            safeSend(p.ws, {
              type: "room:roster",
              players: roster,
              matchState: room.matchState
            });
          }
        }
      }
    }
  });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Neo Strike 2D server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
