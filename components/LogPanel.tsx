import React, { useRef, useEffect } from 'react';
import { TranscriptionEntry } from '../types';

interface LogPanelProps {
  transcriptions: TranscriptionEntry[];
}

const LogPanel: React.FC<LogPanelProps> = ({ transcriptions }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptions]);

  return (
    <div className="w-full h-full p-4 overflow-hidden">
      <div ref={scrollRef} className="h-full overflow-y-auto space-y-4 pr-2">
        {transcriptions.map((entry, index) => (
          <div
            key={index}
            className={`flex flex-col ${
              entry.speaker === 'USER' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-xs md:max-w-md rounded-lg px-4 py-2 ${
                entry.speaker === 'USER'
                  ? 'bg-blue-600 rounded-br-none'
                  : 'bg-slate-700 rounded-bl-none'
              }`}
            >
              <p className="text-sm">{entry.text}</p>
            </div>
          </div>
        ))}
        {transcriptions.length === 0 && (
            <div className="flex items-center justify-center h-full text-slate-500">
                <p>Conversation with Mira will appear here.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default LogPanel;