import React from 'react';

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const GlassPanel: React.FC<GlassPanelProps> = ({
  children,
  className = '',
  onClick,
  ...rest
}) => {
  return (
    <div
      onClick={onClick}
      className={`glass-effect rounded-[3.5rem] p-8 md:p-12 ${className} ${onClick ? 'cursor-pointer active:scale-95 transition-all' : ''}`}
      {...rest}
    >
      {children}
    </div>
  );
};

export default GlassPanel;
