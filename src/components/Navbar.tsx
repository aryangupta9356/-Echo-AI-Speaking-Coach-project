import React from 'react';

export type AppView = 'home' | 'live' | 'mock-interview' | 'reports' | 'about';

interface NavbarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  onStartQuickSession: () => void;
}

const NAV_ITEMS: Array<{ id: AppView; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'live', label: 'Live Coach' },
  { id: 'mock-interview', label: 'Mock Interview' },
  { id: 'reports', label: 'Reports' },
  { id: 'about', label: 'About' },
];

export const Navbar: React.FC<NavbarProps> = ({
  activeView,
  onNavigate,
  onStartQuickSession,
}) => {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#070D0B]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5">
        {/* Zone 1: Single-element brand wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-emerald-400 transition-colors cursor-pointer"
        >
          Echo
        </button>

        {/* Zone 2: Clean single-line navigation links */}
        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {NAV_ITEMS.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'text-emerald-400'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-0 -bottom-[15px] h-[2px] bg-emerald-500" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onStartQuickSession}
            className="px-4 py-2 text-xs font-semibold text-neutral-950 bg-emerald-500 rounded-lg hover:bg-emerald-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Start Session
          </button>
        </div>
      </div>

      {/* Compact mobile navigation row */}
      <nav
        aria-label="Mobile"
        className="flex md:hidden items-center gap-4 overflow-x-auto border-t border-white/[0.06] px-6 py-2 text-xs font-medium"
      >
        {NAV_ITEMS.map((item) => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`whitespace-nowrap shrink-0 py-1 ${
                active ? 'text-emerald-400 font-semibold' : 'text-neutral-400'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
