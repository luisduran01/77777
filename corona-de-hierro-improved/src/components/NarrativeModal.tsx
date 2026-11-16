import React from 'react';
import { StoryBeat, NarrativeChoice } from '../types/game';
import { soundEngine } from '../audio/soundEngine';

interface NarrativeModalProps {
  beat: StoryBeat;
  onSelectChoice: (choice: NarrativeChoice) => void;
}

export const NarrativeModal: React.FC<NarrativeModalProps> = ({ beat, onSelectChoice }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85">
      <div className="w-full max-w-2xl rounded-xl bg-[#111620] border border-amber-500/30 shadow-2xl overflow-hidden">
        {/* Cinematic Top Banner */}
        <div className="px-7 py-5 bg-gradient-to-r from-[#1A202E] to-[#111620] border-b border-white/10">
          <div className="text-xs font-medium text-amber-400 tracking-wider">
            ESCENA DE CARRERA · {beat.speakerRole}
          </div>
          <h2 className="mt-1 font-display text-3xl font-bold text-white tracking-wide">
            {beat.title}
          </h2>
        </div>

        {/* Speaker & Dialogue */}
        <div className="p-7 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0 font-display text-xl font-bold text-amber-400">
              {beat.speaker.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">{beat.speaker}</div>
              <p className="mt-2 text-base text-slate-300 leading-relaxed">
                “{beat.dialogue}”
              </p>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <div className="text-xs font-medium text-slate-400">
              Decisión del aspirante
            </div>
            {beat.choices.map((ch, idx) => (
              <button
                key={idx}
                onClick={() => {
                  soundEngine.playClick();
                  onSelectChoice(ch);
                }}
                className="w-full flex items-center justify-between gap-4 p-4 rounded-lg bg-[#171D2A] hover:bg-[#1E2638] border border-white/10 hover:border-amber-500/60 text-left transition-colors cursor-pointer group"
              >
                <span className="text-sm font-medium text-slate-100 group-hover:text-white">
                  {ch.label}
                </span>
                <span className="font-mono-tabular text-xs text-amber-400 whitespace-nowrap shrink-0">
                  {ch.effectText}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
