import React, { useState, useEffect } from 'react';
import { Song } from '../types';
import { SpotifyIcon, PlayIcon, PauseIcon, SkipNextIcon, SkipPreviousIcon } from './icons';

interface SpotifyPlayerProps {
  song: Song | null;
}

const SpotifyPlayer: React.FC<SpotifyPlayerProps> = ({ song }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (song) {
      setIsPlaying(true);
      setProgress(0);
    } else {
      setIsPlaying(false);
      setProgress(0);
    }
  }, [song]);

  useEffect(() => {
    let interval: number | undefined;
    if (isPlaying && song) {
      interval = window.setInterval(() => {
        setProgress(prev => (prev >= 100 ? 0 : prev + 1));
      }, 1000); // Simulate 100s song
    }
    return () => {
      if(interval) clearInterval(interval);
    }
  }, [isPlaying, song]);

  const togglePlay = () => {
    if(song) {
      setIsPlaying(!isPlaying)
    }
  };

  return (
    <div className="w-full h-full p-4 flex flex-col gap-4 text-white">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <SpotifyIcon className="w-6 h-6 text-green-500" />
        <span>Playing on Spotify</span>
      </div>
      {song ? (
        <div className="flex items-center gap-4">
          <img src={song.albumArtUrl} alt="Album Art" className="w-24 h-24 rounded-md shadow-lg" />
          <div className="flex-grow">
            <h3 className="font-bold text-xl truncate">{song.title}</h3>
            <p className="text-slate-400 truncate">{song.artist}</p>
            <div className="flex items-center gap-4 mt-4">
                <SkipPreviousIcon className="w-6 h-6 text-slate-400 hover:text-white transition cursor-pointer" />
                <button onClick={togglePlay} className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center transition transform hover:scale-105">
                    {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
                </button>
                <SkipNextIcon className="w-6 h-6 text-slate-400 hover:text-white transition cursor-pointer" />
            </div>
          </div>
        </div>
      ) : (
         <div className="flex items-center justify-center h-24 text-slate-500 flex-grow">
            <p>Ask Mira to play a song...</p>
         </div>
      )}
       <div className="w-full mt-auto">
            <div className="h-1 bg-slate-700 rounded-full">
                <div className="h-1 bg-white rounded-full" style={{ width: `${progress}%`, transition: 'width 1s linear' }}></div>
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>{song ? '0:00' : '--:--'}</span>
                <span>{song ? '1:40' : '--:--'}</span>
            </div>
       </div>
    </div>
  );
};

export default SpotifyPlayer;