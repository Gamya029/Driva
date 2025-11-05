export enum DriverState {
  MONITORING = 'MONITORING',
  DROWSY = 'DROWSY',
  UNRESPONSIVE = 'UNRESPONSIVE',
  ENGAGED = 'ENGAGED',
}

export enum MiraState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  SPEAKING = 'SPEAKING',
}

export interface TranscriptionEntry {
  speaker: 'USER' | 'MIRA';
  text: string;
}

export interface Location {
  latitude: number;
  longitude: number;
}

export interface Song {
  title: string;
  artist: string;
  albumArtUrl: string;
}
