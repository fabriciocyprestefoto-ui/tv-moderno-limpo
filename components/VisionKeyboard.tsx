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
    ['@', '-', '_', '!', '#', '$', '%', '&', '+', '='],
  ];

  return (
    <div className="space-y-2 md:space-y-4 p-4 md:p-8 bg-white/5 rounded-4xl md:rounded-[3rem] backdrop-blur-xl shadow-2xl overflow-x-auto no-scrollbar w-full max-w-full border border-white/10">
      {keys.map((row, rowIdx) => (
        <div
          key={rowIdx}
          data-nav-row={rowIdx}
          className="flex justify-start md:justify-center gap-2 md:gap-4 min-w-max md:min-w-0"
        >
          {row.map((key, colIdx) => (
            <button
              key={key}
              data-nav-item
              data-nav-col={colIdx}
              onClick={() => onKeyClick(key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onKeyClick(key);
                }
              }}
              tabIndex={0}
              className="keyboard-key shrink-0 w-12! h-12! min-w-[48px] min-h-[48px] md:w-15! md:h-15! text-sm! md:text-xl! focus:outline-none focus:ring-2 focus:ring-white/35"
            >
              {key}
            </button>
          ))}
        </div>
      ))}
      <div data-nav-row={keys.length} className="flex justify-center gap-2 md:gap-4 pt-2 md:pt-4">
        <button
          data-nav-item
          data-nav-col={0}
          onClick={() => onKeyClick(' ')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onKeyClick(' ');
            }
          }}
          tabIndex={0}
          className="keyboard-key w-40! md:w-75! h-12! min-h-[48px] md:h-15! rounded-full! text-xs! md:text-sm! focus:outline-none focus:ring-2 focus:ring-white/35"
        >
          ESPAÇO
        </button>
        <button
          data-nav-item
          data-nav-col={1}
          onClick={onBackspace}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onBackspace();
            }
          }}
          tabIndex={0}
          className="keyboard-key w-20! md:w-35! h-12! min-h-[48px] md:h-15! rounded-full! text-red-500 text-xs! md:text-sm! focus:outline-none focus:ring-2 focus:ring-white/35"
        >
          APAGAR
        </button>
      </div>
    </div>
  );
};
