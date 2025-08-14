import React, { ReactNode } from 'react';
import './style.less';
import IconBack from '@/ui/assets/icon-back.svg';

interface NavbarProps {
  back?: ReactNode | null;
  onBack?: () => void;
  children?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  desc?: ReactNode;
}

const Navbar = (props: NavbarProps) => {
  const { back, left, right, onBack, children, desc } = props;
  return (
    <div className="vibe3-navbar">
      <div className="vibe3-navbar-container">
        <div className="vibe3-navbar-main">
          <div className="vibe3-navbar-left">
            <div className="vibe3-navbar-back" onClick={onBack}>
              {back ? back : <img src={IconBack} alt=""></img>}
            </div>
            {left}
          </div>
          <div className="vibe3-navbar-title">{children}</div>
          <div className="vibe3-navbar-right">{right}</div>
        </div>
        {desc ? <div className="vibe3-navbar-desc">{desc}</div> : null}
      </div>
    </div>
  );
};

export default Navbar;
