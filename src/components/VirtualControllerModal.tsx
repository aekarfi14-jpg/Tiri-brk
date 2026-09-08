import React from 'react';
import { PlayerInput, TeamId, WeaponType } from '../types.ts';
import { PhoneController } from './phone/PhoneController.tsx';
import { X, Smartphone } from 'lucide-react';

interface VirtualControllerModalProps {
  slot: number;
  playerName: string;
  playerTeam: TeamId;
  selectedWeapon?: WeaponType;
  hp?: number;
  maxHp?: number;
  onSendInput: (input: PlayerInput) => void;
  onClose: () => void;
}

export const VirtualControllerModal: React.FC<VirtualControllerModalProps> = ({
  slot,
  playerName,
  playerTeam,
  selectedWeapon = 'RIFLE',
  hp = 100,
  maxHp = 100,
  onSendInput,
  onClose,
}) => {
  return (
    <div
      id="virtual-controller-modal"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 md:p-6 animate-in fade-in zoom-in-95"
    >
      <div className="relative w-full max-w-4xl h-[420px] md:h-[480px] bg-[#090d16] rounded-3xl border-2 border-cyan-500/60 shadow-[0_0_50px_rgba(56,189,248,0.35)] overflow-hidden flex flex-col">
        {/* Modal Window Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-cyan-400 font-bold">
            <Smartphone className="w-4 h-4" />
            <span>VIRTUAL PHONE GAMEPAD • SIMULATOR (P{slot})</span>
          </div>

          <button
            id="btn-close-sim-modal"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Embedded Real Phone Controller */}
        <div className="flex-1 relative">
          <PhoneController
            slot={slot}
            playerName={playerName}
            playerTeam={playerTeam}
            selectedWeapon={selectedWeapon}
            hp={hp}
            maxHp={maxHp}
            onSendInput={onSendInput}
          />
        </div>
      </div>
    </div>
  );
};
