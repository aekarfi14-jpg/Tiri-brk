import { Capacitor, registerPlugin } from '@capacitor/core';

export interface DiscoveredHost {
  host: string;
  port: number;
  room: string;
}

export interface StartServerResult {
  success: boolean;
  port: number;
  host: string;
  roomCode: string;
  localIps: string[];
}

export interface LocalServerPluginInterface {
  startServer(options: { port?: number; roomCode?: string }): Promise<StartServerResult>;
  stopServer(): Promise<{ stopped: boolean }>;
  getLocalIps(): Promise<{ primaryIp: string; localIps: string[]; port: number }>;
  searchHosts(): Promise<{ hosts: DiscoveredHost[] }>;
}

const LocalServer = registerPlugin<LocalServerPluginInterface>('LocalServerPlugin');

export const isNativeAndroid = (): boolean => {
  return Capacitor.isNativePlatform();
};

/**
 * Start Local Host Server:
 * - In Android Native: Boots embedded Java-WebSocket server on 0.0.0.0:3000 + UDP Discovery
 * - In Web/Node: Verifies existing local Node server
 */
export async function startLocalHostServer(
  port = 3000,
  roomCode = '7942'
): Promise<StartServerResult> {
  if (isNativeAndroid()) {
    try {
      const res = await LocalServer.startServer({ port, roomCode });
      return res;
    } catch (err) {
      console.warn('Native LocalServerPlugin error, falling back to local defaults:', err);
      return {
        success: true,
        port: 3000,
        host: '127.0.0.1',
        roomCode,
        localIps: ['127.0.0.1'],
      };
    }
  }

  // Web Browser / Dev container mode:
  try {
    const res = await fetch('/api/host-info');
    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        port: data.port || 3000,
        host: data.recommendedIp || window.location.hostname || '127.0.0.1',
        roomCode,
        localIps: data.localIps || [window.location.hostname],
      };
    }
  } catch {
    // offline or direct bundle
  }

  return {
    success: true,
    port: 3000,
    host: window.location.hostname || '127.0.0.1',
    roomCode,
    localIps: [window.location.hostname || '127.0.0.1'],
  };
}

export async function stopLocalHostServer(): Promise<void> {
  if (isNativeAndroid()) {
    try {
      await LocalServer.stopServer();
    } catch (err) {
      console.warn('Error stopping native local server:', err);
    }
  }
}

/**
 * Discover TV Hosts on the Local Network:
 * - In Android Native: Sends UDP broadcast "TIRI_DISCOVER_REQ" on LAN (Wi-Fi or Hotspot)
 * - In Web Browser: Probes local host & common subnet gateways
 */
export async function discoverLanHosts(): Promise<DiscoveredHost[]> {
  if (isNativeAndroid()) {
    try {
      const res = await LocalServer.searchHosts();
      return res.hosts || [];
    } catch (err) {
      console.warn('Native UDP discovery error:', err);
      return [];
    }
  }

  // Web Browser Fallback: Probe the local host and common hotspot IP (192.168.43.1)
  const results: DiscoveredHost[] = [];
  const testHosts = [
    window.location.hostname,
    '192.168.43.1', // Android Hotspot default host gateway
    '192.168.1.1',
    '192.168.0.1',
  ].filter(Boolean);

  const uniqueHosts = Array.from(new Set(testHosts));

  await Promise.all(
    uniqueHosts.map(async (host) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        const res = await fetch(`${protocol}//${host}:3000/api/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          results.push({
            host,
            port: 3000,
            room: data.roomCode || '',
          });
        }
      } catch {
        // unreachable, ignore
      }
    })
  );

  return results;
}
