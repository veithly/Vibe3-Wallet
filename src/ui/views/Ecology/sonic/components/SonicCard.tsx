import React from 'react';

export const SonicCard = ({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) => {
  return (
    <div
      className={`rounded-[8px] bg-vibe3-sonic-card border border-vibe3-sonic-card-border text-vibe3-sonic-card-foreground p-[12px] relative overflow-hidden shadow-md ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};
