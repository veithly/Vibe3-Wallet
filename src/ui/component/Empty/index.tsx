import clsx from 'clsx';
import React, { ReactNode } from 'react';
import './style.less';

interface EmptyProps {
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
  title?: ReactNode;
  desc?: ReactNode;
}

const Empty = ({ className, style, children, title, desc }: EmptyProps) => {
  return (
    <div className={clsx('vibe3-empty', className)} style={style}>
      <img className="vibe3-empty-image" src="./images/nodata-tx.png" />
      <div className="vibe3-empty-content">
        {title && <div className="vibe3-empty-title">{title}</div>}
        <div className="vibe3-empty-desc">{children ? children : desc}</div>
      </div>
    </div>
  );
};

export default Empty;
