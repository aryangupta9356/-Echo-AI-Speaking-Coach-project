import { useCallback, useEffect, useState } from 'react';
import { Navbar, type AppView } from './components/Navbar.tsx';
import { HomeView } from './components/HomeView.tsx';
import { LiveCoachView } from './components/LiveCoachView.tsx';
import { MockInterviewView } from './components/MockInterviewView.tsx';
import { ReportView } from './components/ReportView.tsx';
import { AboutView } from './components/AboutView.tsx';
import type { CoachingReport, PracticeContext, SpeakingSession } from './shared/types.ts';

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('home');
  const [liveContext, setLiveContext] = useState<PracticeContext>('interview');
  const [sessions, setSessions] = useState<SpeakingSession[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.sessions)) {
          setSessions(data.sessions);
        }
      }
    } catch {
      // Ignore transient load failure
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleStartLiveCoach = (context: PracticeContext) => {
    setLiveContext(context);
    setActiveView('live');
  };

  const handleReportGenerated = (session: SpeakingSession, _report: CoachingReport) => {
    setSessions((prev) => {
      const rest = prev.filter((s) => s.id !== session.id);
      return [session, ...rest];
    });
    setSelectedReportId(session.id);
    setActiveView('reports');
  };

  const handleSelectReport = (sessionId: string) => {
    setSelectedReportId(sessionId);
    setActiveView('reports');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#070D0B] text-[#E8EFEA]">
      <Navbar
        activeView={activeView}
        onNavigate={setActiveView}
        onStartQuickSession={() => handleStartLiveCoach('interview')}
      />

      <main className="flex-1">
        {activeView === 'home' && (
          <HomeView
            sessions={sessions}
            onStartLiveCoach={handleStartLiveCoach}
            onNavigate={setActiveView}
            onSelectReport={handleSelectReport}
          />
        )}

        {activeView === 'live' && (
          <LiveCoachView
            initialContext={liveContext}
            onReportGenerated={handleReportGenerated}
          />
        )}

        {activeView === 'mock-interview' && (
          <MockInterviewView onReportGenerated={handleReportGenerated} />
        )}

        {activeView === 'reports' && (
          <ReportView
            sessions={sessions}
            selectedSessionId={selectedReportId}
            onSelectSession={setSelectedReportId}
            onStartNew={() => setActiveView('live')}
          />
        )}

        {activeView === 'about' && <AboutView />}
      </main>

      <footer className="border-t border-white/[0.06] py-5 px-6 text-xs text-neutral-500">
        <div className="mx-auto max-w-[1440px] flex flex-wrap items-center justify-between gap-4">
          <span>Echo · AI-Powered Real-Time Speaking Coach</span>
          <span>Browser-local facial landmarks · Session metrics stored in memory</span>
        </div>
      </footer>
    </div>
  );
}
