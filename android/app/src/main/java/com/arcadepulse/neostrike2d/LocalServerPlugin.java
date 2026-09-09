package com.arcadepulse.neostrike2d;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "LocalServerPlugin")
public class LocalServerPlugin extends Plugin {

    private static final String TAG = "LocalServerPlugin";
    private static final int DISCOVERY_PORT = 41234;
    private static final int RECONNECT_TIMEOUT_SEC = 15;

    private EmbeddedGameServer gameServer;
    private int boundPort = 3000;
    private String currentRoomCode = "7942";
    private DiscoveryResponder discoveryResponder;
    private ScheduledExecutorService scheduler;

    // --- Embedded WebSocket Server ---
    private static class PlayerSession {
        int slot;
        String id;
        String name;
        String team;
        boolean ready;
        WebSocket ws;
        long lastPing;
        boolean connected;
        ScheduledFuture<?> disconnectFuture;

        PlayerSession(int slot, String id, String name, String team, WebSocket ws) {
            this.slot = slot;
            this.id = id;
            this.name = name;
            this.team = team;
            this.ready = false;
            this.ws = ws;
            this.lastPing = System.currentTimeMillis();
            this.connected = true;
        }
    }

    private static class Room {
        String code;
        WebSocket tvWs;
        Map<Integer, PlayerSession> players = new ConcurrentHashMap<>();
        String matchState = "LOBBY";
        long createdAt = System.currentTimeMillis();

        Room(String code, WebSocket tvWs) {
            this.code = code;
            this.tvWs = tvWs;
        }
    }

    private class EmbeddedGameServer extends WebSocketServer {
        private final Map<String, Room> rooms = new ConcurrentHashMap<>();
        private final Map<WebSocket, String> wsToRoom = new ConcurrentHashMap<>();
        private final Map<WebSocket, String> wsRole = new ConcurrentHashMap<>(); // "tv" or "phone"
        private final Map<WebSocket, Integer> wsSlot = new ConcurrentHashMap<>();

        public EmbeddedGameServer(InetSocketAddress address) {
            super(address);
            setReuseAddr(true);
        }

        private void safeSend(WebSocket ws, JSONObject data) {
            if (ws != null && ws.isOpen()) {
                try {
                    ws.send(data.toString());
                } catch (Exception e) {
                    Log.e(TAG, "Error sending WS message", e);
                }
            }
        }

        @Override
        public void onOpen(WebSocket conn, ClientHandshake handshake) {
            Log.d(TAG, "WS Connected: " + conn.getRemoteSocketAddress());
        }

        @Override
        public void onClose(WebSocket conn, int code, String reason, boolean remote) {
            Log.d(TAG, "WS Closed: " + conn.getRemoteSocketAddress() + " reason=" + reason);
            handleDisconnect(conn);
        }

        @Override
        public void onMessage(WebSocket conn, String message) {
            try {
                JSONObject msg = new JSONObject(message);
                String type = msg.optString("type", "");

                // 1. TV Create Room
                if ("tv:create_room".equals(type)) {
                    String code = msg.optString("code", currentRoomCode).trim().toUpperCase();
                    if (code.isEmpty()) code = currentRoomCode;
                    currentRoomCode = code;

                    Room room = rooms.get(code);
                    if (room == null) {
                        room = new Room(code, conn);
                        rooms.put(code, room);
                    } else {
                        room.tvWs = conn;
                    }

                    wsToRoom.put(conn, code);
                    wsRole.put(conn, "tv");

                    JSONObject res = new JSONObject();
                    res.put("type", "tv:room_created");
                    res.put("code", code);
                    JSONArray plArray = new JSONArray();
                    for (PlayerSession p : room.players.values()) {
                        JSONObject po = new JSONObject();
                        po.put("slot", p.slot);
                        po.put("id", p.id);
                        po.put("name", p.name);
                        po.put("team", p.team);
                        po.put("ready", p.ready);
                        po.put("connected", p.connected);
                        plArray.put(po);
                    }
                    res.put("players", plArray);
                    safeSend(conn, res);
                    return;
                }

                // 2. Phone Join Room (with 15s Reconnect Support!)
                if ("phone:join_room".equals(type)) {
                    String code = msg.optString("code", "").trim().toUpperCase();
                    Room room = rooms.get(code);

                    if (room == null || room.tvWs == null || !room.tvWs.isOpen()) {
                        JSONObject err = new JSONObject();
                        err.put("type", "join:error");
                        err.put("message", "Room not found or TV is inactive on this Wi-Fi network.");
                        safeSend(conn, err);
                        return;
                    }

                    String incomingId = msg.optString("playerId", null);
                    Integer targetSlot = null;

                    // Reconnection check
                    if (incomingId != null && !incomingId.isEmpty()) {
                        for (Map.Entry<Integer, PlayerSession> entry : room.players.entrySet()) {
                            if (incomingId.equals(entry.getValue().id)) {
                                targetSlot = entry.getKey();
                                break;
                            }
                        }
                    }

                    boolean isReconnect = false;
                    if (targetSlot != null) {
                        // Reconnect to existing reserved slot
                        isReconnect = true;
                        PlayerSession existing = room.players.get(targetSlot);
                        if (existing != null) {
                            if (existing.disconnectFuture != null && !existing.disconnectFuture.isDone()) {
                                existing.disconnectFuture.cancel(false);
                            }
                            existing.ws = conn;
                            existing.connected = true;
                            existing.lastPing = System.currentTimeMillis();
                            if (msg.has("name") && !msg.getString("name").isEmpty()) {
                                existing.name = msg.getString("name");
                            }
                            if (msg.has("team") && !msg.getString("team").isEmpty()) {
                                existing.team = msg.getString("team");
                            }
                        }
                    } else {
                        // Find first free slot (1 to 4)
                        for (int i = 1; i <= 4; i++) {
                            if (!room.players.containsKey(i)) {
                                targetSlot = i;
                                break;
                            }
                        }
                    }

                    if (targetSlot == null) {
                        JSONObject err = new JSONObject();
                        err.put("type", "join:error");
                        err.put("message", "Room is full (Maximum 4 players).");
                        safeSend(conn, err);
                        return;
                    }

                    String[] teamDefaults = new String[]{"RED", "BLUE", "GREEN", "RED"};
                    String pId = (incomingId != null && !incomingId.isEmpty())
                            ? incomingId
                            : "p_" + System.currentTimeMillis() + "_" + targetSlot;
                    String pName = msg.optString("name", "Player " + targetSlot);
                    String pTeam = msg.optString("team", teamDefaults[targetSlot - 1]);

                    PlayerSession session;
                    if (isReconnect && room.players.containsKey(targetSlot)) {
                        session = room.players.get(targetSlot);
                    } else {
                        session = new PlayerSession(targetSlot, pId, pName, pTeam, conn);
                        room.players.put(targetSlot, session);
                    }

                    wsToRoom.put(conn, code);
                    wsRole.put(conn, "phone");
                    wsSlot.put(conn, targetSlot);

                    // Confirm to phone
                    JSONObject success = new JSONObject();
                    success.put("type", "join:success");
                    success.put("code", code);
                    success.put("slot", targetSlot);
                    success.put("playerId", session.id);
                    success.put("name", session.name);
                    success.put("team", session.team);
                    success.put("matchState", room.matchState);
                    success.put("isReconnect", isReconnect);
                    safeSend(conn, success);

                    // Notify TV
                    JSONObject notifyTv = new JSONObject();
                    notifyTv.put("type", isReconnect ? "player:reconnected" : "player:joined");
                    notifyTv.put("slot", targetSlot);
                    notifyTv.put("id", session.id);
                    notifyTv.put("name", session.name);
                    notifyTv.put("team", session.team);
                    notifyTv.put("ready", session.ready);
                    safeSend(room.tvWs, notifyTv);
                    return;
                }

                // 3. Phone Input (High frequency)
                if ("phone:input".equals(type)) {
                    String roomCode = wsToRoom.get(conn);
                    Integer slot = wsSlot.get(conn);
                    if (roomCode != null && slot != null) {
                        Room room = rooms.get(roomCode);
                        if (room != null && room.tvWs != null) {
                            JSONObject forwarded = new JSONObject();
                            forwarded.put("type", "player:input");
                            forwarded.put("slot", slot);
                            forwarded.put("inputs", msg.optJSONObject("inputs"));
                            safeSend(room.tvWs, forwarded);
                        }
                    }
                    return;
                }

                // 4. Phone Update Profile
                if ("phone:update_profile".equals(type)) {
                    String roomCode = wsToRoom.get(conn);
                    Integer slot = wsSlot.get(conn);
                    if (roomCode != null && slot != null) {
                        Room room = rooms.get(roomCode);
                        if (room != null) {
                            PlayerSession p = room.players.get(slot);
                            if (p != null) {
                                if (msg.has("name")) p.name = msg.getString("name");
                                if (msg.has("team")) p.team = msg.getString("team");
                                if (msg.has("ready")) p.ready = msg.getBoolean("ready");

                                JSONObject upd = new JSONObject();
                                upd.put("type", "player:updated");
                                upd.put("slot", slot);
                                upd.put("name", p.name);
                                upd.put("team", p.team);
                                upd.put("ready", p.ready);
                                safeSend(room.tvWs, upd);
                            }
                        }
                    }
                    return;
                }

                // 5. TV Match State Sync
                if ("tv:match_state".equals(type)) {
                    String roomCode = wsToRoom.get(conn);
                    if (roomCode != null) {
                        Room room = rooms.get(roomCode);
                        if (room != null) {
                            room.matchState = msg.optString("matchState", "LOBBY");
                            for (PlayerSession p : room.players.values()) {
                                if (p.connected && p.ws != null) {
                                    safeSend(p.ws, msg);
                                }
                            }
                        }
                    }
                    return;
                }

                // 6. TV Phone Haptic Feedback
                if ("tv:phone_haptic".equals(type)) {
                    String roomCode = wsToRoom.get(conn);
                    int targetSlot = msg.optInt("slot", 0);
                    if (roomCode != null && targetSlot > 0) {
                        Room room = rooms.get(roomCode);
                        if (room != null) {
                            PlayerSession p = room.players.get(targetSlot);
                            if (p != null && p.connected && p.ws != null) {
                                safeSend(p.ws, msg);
                            }
                        }
                    }
                    return;
                }

                // 7. TV Kick Player
                if ("tv:kick_player".equals(type)) {
                    String roomCode = wsToRoom.get(conn);
                    int kickSlot = msg.optInt("slot", 0);
                    if (roomCode != null && kickSlot > 0) {
                        Room room = rooms.get(roomCode);
                        if (room != null) {
                            PlayerSession p = room.players.remove(kickSlot);
                            if (p != null && p.ws != null) {
                                JSONObject kicked = new JSONObject();
                                kicked.put("type", "kicked");
                                kicked.put("reason", "Disconnected by TV Host.");
                                safeSend(p.ws, kicked);
                            }
                        }
                    }
                    return;
                }

                // 8. Ping / Pong
                if ("ping".equals(type)) {
                    JSONObject pong = new JSONObject();
                    pong.put("type", "pong");
                    pong.put("clientTime", msg.optDouble("clientTime", 0));
                    pong.put("serverTime", System.currentTimeMillis());
                    safeSend(conn, pong);
                    return;
                }

            } catch (Exception e) {
                Log.e(TAG, "Error handling WS message", e);
            }
        }

        private void handleDisconnect(WebSocket conn) {
            String roomCode = wsToRoom.remove(conn);
            String role = wsRole.remove(conn);
            Integer slot = wsSlot.remove(conn);

            if (roomCode == null) return;
            Room room = rooms.get(roomCode);
            if (room == null) return;

            if ("tv".equals(role) && room.tvWs == conn) {
                room.tvWs = null;
                JSONObject tvDis = new JSONObject();
                try {
                    tvDis.put("type", "tv:disconnected");
                    tvDis.put("message", "TV host disconnected. Waiting for host...");
                } catch (Exception ignored) {}
                for (PlayerSession p : room.players.values()) {
                    safeSend(p.ws, tvDis);
                }
            } else if ("phone".equals(role) && slot != null) {
                final PlayerSession p = room.players.get(slot);
                if (p != null && p.ws == conn) {
                    p.connected = false;
                    p.ws = null;

                    // Notify TV immediately of temporary disconnection
                    JSONObject dis = new JSONObject();
                    try {
                        dis.put("type", "player:disconnected");
                        dis.put("slot", slot);
                        dis.put("id", p.id);
                        dis.put("reconnectWindowSec", RECONNECT_TIMEOUT_SEC);
                    } catch (Exception ignored) {}
                    safeSend(room.tvWs, dis);

                    // Start 15-second Reconnect Grace Period
                    if (scheduler != null && !scheduler.isShutdown()) {
                        p.disconnectFuture = scheduler.schedule(() -> {
                            // If player still hasn't reconnected after 15 seconds, release slot!
                            if (!p.connected) {
                                room.players.remove(slot);
                                JSONObject left = new JSONObject();
                                try {
                                    left.put("type", "player:left");
                                    left.put("slot", slot);
                                } catch (Exception ignored) {}
                                safeSend(room.tvWs, left);
                                Log.d(TAG, "Slot " + slot + " freed after reconnect timeout.");
                            }
                        }, RECONNECT_TIMEOUT_SEC, TimeUnit.SECONDS);
                    }
                }
            }
        }

        @Override
        public void onError(WebSocket conn, Exception ex) {
            Log.e(TAG, "WS Server Error", ex);
        }

        @Override
        public void onStart() {
            Log.d(TAG, "Embedded GameServer started successfully on port " + getPort());
        }
    }

    // --- UDP Discovery Responder (Host Side) ---
    private class DiscoveryResponder extends Thread {
        private DatagramSocket socket;
        private volatile boolean running = true;

        @Override
        public void run() {
            try {
                socket = new DatagramSocket(DISCOVERY_PORT);
                socket.setBroadcast(true);
                byte[] buffer = new byte[1024];

                while (running) {
                    DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                    socket.receive(packet);

                    String msg = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8);
                    if (msg.contains("TIRI_DISCOVER_REQ")) {
                        String localIp = getPrimaryLocalIp();
                        JSONObject res = new JSONObject();
                        res.put("type", "TIRI_HOST_RES");
                        res.put("host", localIp);
                        res.put("port", boundPort);
                        res.put("room", currentRoomCode);

                        byte[] outBytes = res.toString().getBytes(StandardCharsets.UTF_8);
                        DatagramPacket reply = new DatagramPacket(
                                outBytes,
                                outBytes.length,
                                packet.getAddress(),
                                packet.getPort()
                        );
                        socket.send(reply);
                    }
                }
            } catch (Exception e) {
                if (running) Log.w(TAG, "Discovery responder ended", e);
            } finally {
                if (socket != null && !socket.isClosed()) socket.close();
            }
        }

        public void stopDiscovery() {
            running = false;
            if (socket != null && !socket.isClosed()) socket.close();
        }
    }

    // --- Plugin Lifecycle & Public Methods ---
    @Override
    public void load() {
        super.load();
        scheduler = Executors.newScheduledThreadPool(2);
    }

    @Override
    protected void handleOnDestroy() {
        stopAllServers();
        if (scheduler != null) scheduler.shutdown();
        super.handleOnDestroy();
    }

    private void stopAllServers() {
        if (discoveryResponder != null) {
            discoveryResponder.stopDiscovery();
            discoveryResponder = null;
        }
        if (gameServer != null) {
            try {
                gameServer.stop();
            } catch (Exception e) {
                Log.e(TAG, "Error stopping game server", e);
            }
            gameServer = null;
        }
    }

    @PluginMethod
    public void startServer(PluginCall call) {
        int port = call.getInt("port", 3000);
        String room = call.getString("roomCode", "7942");
        this.currentRoomCode = room;

        stopAllServers();

        // Try ports from requested up to port+10
        int chosenPort = port;
        boolean started = false;

        for (int p = port; p <= port + 10; p++) {
            try {
                gameServer = new EmbeddedGameServer(new InetSocketAddress("0.0.0.0", p));
                gameServer.start();
                chosenPort = p;
                started = true;
                break;
            } catch (Exception e) {
                Log.w(TAG, "Port " + p + " busy, trying next...", e);
            }
        }

        if (!started) {
            call.reject("Could not bind embedded WebSocket server to ports " + port + "-" + (port + 10));
            return;
        }

        this.boundPort = chosenPort;

        // Start UDP discovery responder
        try {
            discoveryResponder = new DiscoveryResponder();
            discoveryResponder.start();
        } catch (Exception e) {
            Log.w(TAG, "Could not start UDP discovery responder", e);
        }

        String primaryIp = getPrimaryLocalIp();
        List<String> allIps = getAllLocalIps();

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("port", chosenPort);
        ret.put("host", primaryIp);
        ret.put("roomCode", currentRoomCode);

        JSArray ipsArr = new JSArray();
        for (String ip : allIps) {
            ipsArr.put(ip);
        }
        ret.put("localIps", ipsArr);

        Log.d(TAG, "Embedded Local Server active on " + primaryIp + ":" + chosenPort + " [Room: " + currentRoomCode + "]");
        call.resolve(ret);
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        stopAllServers();
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getLocalIps(PluginCall call) {
        String primary = getPrimaryLocalIp();
        List<String> all = getAllLocalIps();

        JSObject ret = new JSObject();
        ret.put("primaryIp", primary);
        JSArray arr = new JSArray();
        for (String ip : all) {
            arr.put(ip);
        }
        ret.put("localIps", arr);
        ret.put("port", boundPort);
        call.resolve(ret);
    }

    @PluginMethod
    public void searchHosts(PluginCall call) {
        // Run on background thread
        Executors.newSingleThreadExecutor().execute(() -> {
            WifiManager.MulticastLock lock = null;
            DatagramSocket searchSocket = null;
            try {
                Context ctx = getContext();
                if (ctx != null) {
                    WifiManager wm = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                    if (wm != null) {
                        lock = wm.createMulticastLock("TiriStrikeDiscovery");
                        lock.setReferenceCounted(true);
                        lock.acquire();
                    }
                }

                searchSocket = new DatagramSocket();
                searchSocket.setBroadcast(true);
                searchSocket.setSoTimeout(2200);

                byte[] req = "TIRI_DISCOVER_REQ".getBytes(StandardCharsets.UTF_8);

                // Broadcast to standard 255.255.255.255
                DatagramPacket p1 = new DatagramPacket(req, req.length, InetAddress.getByName("255.255.255.255"), DISCOVERY_PORT);
                searchSocket.send(p1);

                // Also try common Hotspot gateway/broadcast 192.168.43.255
                try {
                    DatagramPacket p2 = new DatagramPacket(req, req.length, InetAddress.getByName("192.168.43.255"), DISCOVERY_PORT);
                    searchSocket.send(p2);
                } catch (Exception ignored) {}

                long endTime = System.currentTimeMillis() + 2200;
                JSArray foundHosts = new JSArray();
                List<String> seenHosts = new ArrayList<>();

                byte[] buf = new byte[1024];
                while (System.currentTimeMillis() < endTime) {
                    try {
                        DatagramPacket responsePacket = new DatagramPacket(buf, buf.length);
                        searchSocket.receive(responsePacket);

                        String resp = new String(responsePacket.getData(), 0, responsePacket.getLength(), StandardCharsets.UTF_8);
                        if (resp.contains("TIRI_HOST_RES")) {
                            JSONObject obj = new JSONObject(resp);
                            String host = obj.optString("host", responsePacket.getAddress().getHostAddress());
                            int port = obj.optInt("port", 3000);
                            String room = obj.optString("room", "");

                            String key = host + ":" + port;
                            if (!seenHosts.contains(key)) {
                                seenHosts.add(key);
                                JSObject item = new JSObject();
                                item.put("host", host);
                                item.put("port", port);
                                item.put("room", room);
                                foundHosts.put(item);
                            }
                        }
                    } catch (Exception timeout) {
                        break;
                    }
                }

                JSObject res = new JSObject();
                res.put("hosts", foundHosts);
                call.resolve(res);

            } catch (Exception e) {
                Log.e(TAG, "Search hosts error", e);
                JSObject res = new JSObject();
                res.put("hosts", new JSArray());
                call.resolve(res);
            } finally {
                if (searchSocket != null && !searchSocket.isClosed()) searchSocket.close();
                if (lock != null && lock.isHeld()) lock.release();
            }
        });
    }

    // --- Network Helpers ---
    private String getPrimaryLocalIp() {
        List<String> ips = getAllLocalIps();
        if (ips.isEmpty()) {
            return "127.0.0.1";
        }
        // Priority: 192.168.x.x, 10.x.x.x, 172.x.x.x
        for (String ip : ips) {
            if (ip.startsWith("192.168.")) return ip;
        }
        for (String ip : ips) {
            if (ip.startsWith("10.")) return ip;
        }
        return ips.get(0);
    }

    private List<String> getAllLocalIps() {
        List<String> result = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            if (interfaces == null) return result;

            for (NetworkInterface iface : Collections.list(interfaces)) {
                if (iface.isLoopback() || !iface.isUp()) continue;

                Enumeration<InetAddress> addresses = iface.getInetAddresses();
                for (InetAddress addr : Collections.list(addresses)) {
                    if (!addr.isLoopbackAddress() && addr instanceof java.net.Inet4Address) {
                        String ip = addr.getHostAddress();
                        if (ip != null && !ip.startsWith("127.")) {
                            result.add(ip);
                        }
                    }
                }
            }
        } catch (SocketException e) {
            Log.e(TAG, "Error enumerating network interfaces", e);
        }
        return result;
    }
}
