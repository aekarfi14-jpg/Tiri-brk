import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FirstLaunchScreen } from './components/FirstLaunchScreen.tsx';
import { TvLobby } from './components/tv/TvLobby.tsx';
import { TvGameScreen } from './components/tv/TvGameScreen.tsx';
import { PhoneScanner } from './components/phone/PhoneScanner.tsx';
import { PhoneLobby } from './components/phone/PhoneLobby.tsx';
import { PhoneController } from './components/phone/PhoneController.tsx';
import { VirtualControllerModal } from './components/VirtualControllerModal.tsx';
import { GameEngine } from './game/gameEngine.ts';
import { MatchState, MatchSummary, PlayerInput, PlayerSlotData, TeamId, WeaponType } from './types.ts';
import { sound } from './audio/soundEngine.ts';

type AppMode = 'select' | 'tv' | 'phone';

export default function App() {
  // Check URL params on initial load
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialMode = (urlParams?.get('mode') as AppMode) || 'select';
  const initialRoom = urlParams?.get('room') || '';

  const [mode, setMode] = useState<AppMode>(initialMode);
  const [roomCode, setRoomCode] = useState<string>(initialRoom.toUpperCase());

  // TV States
  const [tvPlayers, setTvPlayers] = useState<PlayerSlotData[]>([]);
  const [matchState, setMatchState] = useState<MatchState>('LOBBY');
  const [matchSummary, setMatchSummary] = useState<MatchSummary | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // Phone States
  const [phoneSlot, setPhoneSlot] = useState<number | null>(null);
  const [phonePlayerId, setPhonePlayerId] = useState<string>('');
  const [phoneName, setPhoneName] = useState<string>('Player 1');
  const [phoneTeam, setPhoneTeam] = useState<TeamId>('RED');
  const [phoneReady, setPhoneReady] = useState(false);
  const [phoneHp, setPhoneHp] = useState(100);
  const [phoneSelectedWeapon, setPhoneSelectedWeapon] = useState<WeaponType>('RIFLE');
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [phoneLatency, setPhoneLatency] = useState<number | null>(null);

  // Practice Mode tracking
  const isPracticeRef = useRef<{ isPractice: boolean; botCount: number }>({
    isPractice: false,
    botCount: 2,
  });

  // Virtual Controller Simulator modal state (for preview testing)
  const [simSlot, setSimSlot] = useState<number | null>(null);

  // WebSocket Ref
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<any>(null);

  // Initialize Authoritative Game Engine on TV
  useEffect(() => {
    if (!engineRef.current) {
      const eng = new GameEngine();
      eng.onStateChange = (state, summary) => {
        setMatchState(state);
        if (summary) setMatchSummary(summary);

        // Broadcast match state to connected phones
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'tv:match_state',
              matchState: state,
              winnerTeam: summary?.winnerTeam || null,
              winnerNames: summary?.winnerPlayers || [],
            })
          );
        }
      };

      eng.onPhoneHaptic = (slot, effect, hp, maxHp) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'tv:phone_haptic',
              slot,
              effect,
              hp,
              maxHp,
            })
          );
        }
      };

      engineRef.current = eng;
    }
  }, []);

  // Helper to get WebSocket URL
  const getWsUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  };

  // Connect WebSocket
  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(getWsUrl());

      ws.onopen = () => {
        setIsWsConnected(true);

        if (mode === 'tv') {
          // Register as TV host
          ws.send(
            JSON.stringify({
              type: 'tv:create_room',
              code: roomCode || undefined,
            })
          );
        } else if (mode === 'phone' && roomCode) {
          // Register as phone controller
          ws.send(
            JSON.stringify({
              type: 'phone:join_room',
              code: roomCode,
              playerId: phonePlayerId || undefined,
              name: phoneName,
              team: phoneTeam,
            })
          );
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // TV Messages
          if (msg.type === 'tv:room_created') {
            setRoomCode(msg.code);
            if (msg.players) {
              setTvPlayers(
                msg.players.map((p: any) => ({
                  slot: p.slot,
                  id: p.id,
                  name: p.name,
                  team: p.team,
                  ready: p.ready,
                  connected: true,
                }))
              );
            }
          }

          if (msg.type === 'player:joined') {
            sound.playClick();
            setTvPlayers((prev) => {
              const filtered = prev.filter((p) => p.slot !== msg.slot);
              return [
                ...filtered,
                {
                  slot: msg.slot,
                  id: msg.id,
                  name: msg.name,
                  team: msg.team,
                  ready: msg.ready || false,
                  connected: true,
                },
              ].sort((a, b) => a.slot - b.slot);
            });
          }

          if (msg.type === 'player:left') {
            setTvPlayers((prev) => prev.filter((p) => p.slot !== msg.slot));
          }

          if (msg.type === 'player:updated') {
            setTvPlayers((prev) =>
              prev.map((p) =>
                p.slot === msg.slot
                  ? { ...p, name: msg.name, team: msg.team, ready: msg.ready }
                  : p
              )
            );
          }

          if (msg.type === 'player:input') {
            if (engineRef.current && matchState !== 'LOBBY') {
              engineRef.current.handleInput(msg.slot, msg.inputs);
            }
          }

          // Phone Messages
          if (msg.type === 'join:success') {
            sound.playClick();
            setPhoneSlot(msg.slot);
            setPhonePlayerId(msg.playerId);
            setPhoneName(msg.name);
            setPhoneTeam(msg.team);
            setMatchState(msg.matchState || 'LOBBY');
          }

          if (msg.type === 'join:error') {
            alert(msg.message || 'Could not join room');
            setRoomCode('');
          }

          if (msg.type === 'profile:updated') {
            if (msg.name) setPhoneName(msg.name);
            if (msg.team) setPhoneTeam(msg.team);
            if (typeof msg.ready === 'boolean') setPhoneReady(msg.ready);
          }

          if (msg.type === 'match:state') {
            setMatchState(msg.matchState);
            if (msg.matchState === 'ENDED') {
              setMatchSummary({
                winnerTeam: msg.winnerTeam,
                winnerPlayers: msg.winnerNames || [],
                durationSec: 0,
              });
            }
          }

          if (msg.type === 'haptic') {
            if (typeof msg.hp === 'number') setPhoneHp(msg.hp);
            if (msg.weapon) setPhoneSelectedWeapon(msg.weapon);
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              if (msg.effect === 'hit') navigator.vibrate(35);
              else if (msg.effect === 'eliminated') navigator.vibrate([100, 50, 100]);
              else if (msg.effect === 'shield') navigator.vibrate(20);
            }
          }

          if (msg.type === 'pong') {
            if (typeof msg.clientTime === 'number') {
              const rtt = Math.round(performance.now() - msg.clientTime);
              setPhoneLatency(rtt);
            }
          }

          if (msg.type === 'kicked') {
            alert('You were disconnected by the TV host.');
            setPhoneSlot(null);
            setRoomCode('');
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      ws.onclose = () => {
        setIsWsConnected(false);
        // Attempt reconnect after 2 seconds
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(connectWebSocket, 2000);
      };

      wsRef.current = ws;
    } catch (e) {
      console.error('WS connection error:', e);
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(connectWebSocket, 2500);
    }
  }, [mode, roomCode, phonePlayerId, phoneName, phoneTeam, matchState]);

  // Connect whenever TV or Phone mode is chosen
  useEffect(() => {
    if (mode === 'tv') {
      connectWebSocket();
    } else if (mode === 'phone' && roomCode) {
      connectWebSocket();
    }

    return () => {
      clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [mode, roomCode, connectWebSocket]);

  // Periodic Ping for Phone mode to measure latency and keep connection alive
  useEffect(() => {
    if (mode !== 'phone') return;
    const interval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'ping',
            clientTime: performance.now(),
          })
        );
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [mode]);

  // TV Host Actions
  const handleTvStartMatch = () => {
    if (!engineRef.current) return;
    isPracticeRef.current.isPractice = false;
    sound.playClick();
    engineRef.current.initMatch(tvPlayers);
  };

  const handleTvStartPracticeMatch = (botCount: number = 2) => {
    if (!engineRef.current) return;
    isPracticeRef.current = { isPractice: true, botCount };
    sound.playClick();

    // If no human player is registered yet, create Slot 1 player
    let roster = [...tvPlayers];
    if (roster.length === 0) {
      roster.push({
        slot: 1,
        id: `player_1_host`,
        name: 'Player 1',
        team: 'RED',
        ready: true,
        connected: true,
      });
      setTvPlayers(roster);
    }
    engineRef.current.initPracticeMatch(roster, botCount);
  };

  const handleTvRematch = () => {
    if (!engineRef.current) return;
    sound.playClick();
    if (isPracticeRef.current.isPractice) {
      engineRef.current.initPracticeMatch(tvPlayers, isPracticeRef.current.botCount);
    } else {
      engineRef.current.initMatch(tvPlayers);
    }
  };

  const handleTvReturnToLobby = () => {
    sound.playClick();
    isPracticeRef.current.isPractice = false;
    setMatchState('LOBBY');
    setMatchSummary(null);
    if (engineRef.current) {
      engineRef.current.matchState = 'LOBBY';
      engineRef.current.particles.clear();
      engineRef.current.projectiles = [];
    }
    sound.stopBattleMusic();

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'tv:match_state',
          matchState: 'LOBBY',
        })
      );
    }
  };

  const handleTvUpdatePlayer = (slot: number, name: string, team: TeamId) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'tv:update_player',
          slot,
          name,
          team,
        })
      );
    }
    setTvPlayers((prev) =>
      prev.map((p) => (p.slot === slot ? { ...p, name, team } : p))
    );
  };

  const handleTvKickPlayer = (slot: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'tv:kick_player',
          slot,
        })
      );
    }
    setTvPlayers((prev) => prev.filter((p) => p.slot !== slot));
  };

  // Add Simulated Test Player (for rapid in-preview testing)
  const handleAddSimulatedPlayer = () => {
    sound.playClick();
    let nextSlot = 1;
    for (let i = 1; i <= 4; i++) {
      if (!tvPlayers.some((p) => p.slot === i)) {
        nextSlot = i;
        break;
      }
    }

    const teams: TeamId[] = ['RED', 'BLUE', 'GREEN', 'RED'];
    const newPlayer: PlayerSlotData = {
      slot: nextSlot,
      id: `sim_${Date.now()}_${nextSlot}`,
      name: `Test Player ${nextSlot}`,
      team: teams[nextSlot - 1],
      ready: true,
      connected: true,
    };

    setTvPlayers((prev) => [...prev, newPlayer].sort((a, b) => a.slot - b.slot));
  };

  // Phone Actions
  const handlePhoneConnect = (scannedCode: string) => {
    setRoomCode(scannedCode);
  };

  const handlePhoneUpdateProfile = (name: string, team: TeamId) => {
    setPhoneName(name);
    setPhoneTeam(team);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'phone:update_profile',
          name,
          team,
        })
      );
    }
  };

  const handlePhoneToggleReady = (ready: boolean) => {
    setPhoneReady(ready);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'phone:update_profile',
          ready,
        })
      );
    }
  };

  const handlePhoneSendInput = (inputs: PlayerInput) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'phone:input',
          inputs,
        })
      );
    }
  };

  const handlePhoneDisconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setPhoneSlot(null);
    setRoomCode('');
  };

  // Feed simulated input directly to engine
  const handleSimInput = (slot: number, inputs: PlayerInput) => {
    if (engineRef.current) {
      engineRef.current.handleInput(slot, inputs);
    }
  };

  // 1. Initial Device Mode Selection Screen
  if (mode === 'select') {
    return (
      <FirstLaunchScreen
        onSelectMode={(selected) => {
          setMode(selected);
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.set('mode', selected);
          window.history.replaceState({}, '', newUrl.toString());
        }}
      />
    );
  }

  // 2. TV MODE
  if (mode === 'tv') {
    return (
      <>
        {matchState === 'LOBBY' ? (
          <TvLobby
            roomCode={roomCode}
            players={tvPlayers}
            onStartMatch={handleTvStartMatch}
            onStartPracticeMatch={handleTvStartPracticeMatch}
            onUpdatePlayer={handleTvUpdatePlayer}
            onKickPlayer={handleTvKickPlayer}
            onAddSimulatedPlayer={handleAddSimulatedPlayer}
            onOpenPhoneSim={(slot) => setSimSlot(slot)}
            onSwitchMode={() => {
              setMode('select');
              window.history.replaceState({}, '', window.location.pathname);
            }}
          />
        ) : (
          engineRef.current && (
            <TvGameScreen
              engine={engineRef.current}
              matchState={matchState}
              summary={matchSummary}
              onRematch={handleTvRematch}
              onReturnToLobby={handleTvReturnToLobby}
              onOpenPhoneSim={(slot) => setSimSlot(slot)}
            />
          )
        )}

        {/* Virtual Gamepad Drawer/Modal for in-preview testing */}
        {simSlot !== null && (
          <VirtualControllerModal
            slot={simSlot}
            playerName={tvPlayers.find((p) => p.slot === simSlot)?.name || `Player ${simSlot}`}
            playerTeam={tvPlayers.find((p) => p.slot === simSlot)?.team || 'RED'}
            selectedWeapon="RIFLE"
            hp={engineRef.current?.players.get(simSlot)?.hp ?? 100}
            maxHp={100}
            onSendInput={(inp) => handleSimInput(simSlot, inp)}
            onClose={() => setSimSlot(null)}
          />
        )}
      </>
    );
  }

  // 3. PHONE MODE
  if (mode === 'phone') {
    if (!phoneSlot || !roomCode) {
      return (
        <PhoneScanner
          initialCode={roomCode}
          onConnect={handlePhoneConnect}
          onSwitchToTv={() => {
            setMode('tv');
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('mode', 'tv');
            window.history.replaceState({}, '', newUrl.toString());
          }}
        />
      );
    }

    if (matchState === 'LOBBY') {
      return (
        <PhoneLobby
          roomCode={roomCode}
          slot={phoneSlot}
          playerName={phoneName}
          playerTeam={phoneTeam}
          isReady={phoneReady}
          isConnected={isWsConnected}
          onUpdateProfile={handlePhoneUpdateProfile}
          onToggleReady={handlePhoneToggleReady}
          onDisconnect={handlePhoneDisconnect}
        />
      );
    }

    // MATCH STARTED: Phone transforms into wireless gamepad controller!
    return (
      <PhoneController
        slot={phoneSlot}
        playerName={phoneName}
        playerTeam={phoneTeam}
        selectedWeapon={phoneSelectedWeapon}
        hp={phoneHp}
        maxHp={100}
        latencyMs={phoneLatency ?? undefined}
        onSendInput={handlePhoneSendInput}
        onDisconnect={handlePhoneDisconnect}
      />
    );
  }

  return null;
}
