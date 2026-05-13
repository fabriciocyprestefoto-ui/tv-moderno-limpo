import React from 'react';

interface VisionKeyboardProps {
  onKeyClick: (key: string) => void;
  onBackspace: () => void;
}

export const VisionKeyboard: React.FC<VisionKeyboardProps> = ({ onKeyClick, onBackspace }) => {
  const keys = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '?'],
  ];

  return (
    <div className="space-y-2 md:space-y-4 p-4 md:p-8 bg-white/5 rounded-4xl md:rounded-[3rem] backdrop-blur-xl shadow-2xl overflow-x-auto no-scrollbar w-full max-w-full border border-white/10">
      {keys.map((row, i) => (
        <div
          key={i}
          className="flex justify-start md:justify-center gap-2 md:gap-4 min-w-max md:min-w-0"
        >
          {row.map((key) => (
            <button
              key={key}
              onClick={() => onKeyClick(key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onKeyClick(key);
                }
              }}
              tabIndex={0}
              className="keyboard-key shrink-0 w-14! h-14! md:w-18! md:h-18! text-base! md:text-xl! focus:outline-none focus:ring-2 focus:ring-[#A855F7]/60"
            >
              {key}
            </button>
          ))}
        </div>
      ))}
      <div className="flex justify-center gap-2 md:gap-4 pt-2 md:pt-4">
        <button
          onClick={() => onKeyClick(' ')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onKeyClick(' ');
            }
          }}
          tabIndex={0}
          className="keyboard-key w-40! md:w-75! h-14! md:h-18! rounded-full! text-sm! md:text-base! focus:outline-none focus:ring-2 focus:ring-[#A855F7]/60"
        >
          ESPAÇO
        </button>
        <button
          onClick={onBackspace}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onBackspace();
            }
          }}
          tabIndex={0}
          className="keyboard-key w-20! md:w-35! h-14! md:h-18! rounded-full! text-red-500 text-sm! md:text-base! focus:outline-none focus:ring-2 focus:ring-[#A855F7]/60"
        >
          APAGAR
        </button>
      </div>
    </div>
  );
};
