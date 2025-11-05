import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from "@google/genai";
import { DriverState, MiraState, TranscriptionEntry, Location, Song } from './types';
import { MicrophoneIcon, LocationIcon, AlertIcon, PhoneIcon } from './components/icons';
import MiraCore from './components/MiraCore';
import LogPanel from './components/LogPanel';
import SpotifyPlayer from './components/SpotifyPlayer';
import { getEyeAspectRatio } from './utils/fatigueDetection';

// Declare faceapi as a global variable
declare const faceapi: any;

// --- Helper Functions for Audio Processing ---
function encode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}


const App: React.FC = () => {
    const [driverState, setDriverState] = useState<DriverState>(DriverState.MONITORING);
    const [miraState, setMiraState] = useState<MiraState>(MiraState.IDLE);
    const [permissionsGranted, setPermissionsGranted] = useState(false);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
    const [location, setLocation] = useState<Location | null>(null);
    const [isEmergency, setIsEmergency] = useState(false);
    const [emergencyCountdown, setEmergencyCountdown] = useState(15);
    const [currentSong, setCurrentSong] = useState<Song | null>(null);
    const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const nextAudioStartTimeRef = useRef(0);
    const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const emergencyTimerRef = useRef<number | null>(null);
    const detectionIntervalRef = useRef<number | null>(null);
    const eyeClosedFramesRef = useRef(0);
    const noFaceFramesRef = useRef(0);
    
    const emergencyContact = '6361449873';

    // --- Fatigue Detection Constants ---
    const EAR_THRESHOLD = 0.25; // Eye Aspect Ratio threshold for blink/closure
    const CONSECUTIVE_FRAMES_DROWSY = 10; // 10 frames * 200ms = 2 seconds of eye closure
    const CONSECUTIVE_FRAMES_UNRESPONSIVE = 25; // 25 frames * 200ms = 5 seconds of no face

    // --- Gemini API ---
    const aiRef = useRef<GoogleGenAI | null>(null);

    const initializeAi = useCallback(() => {
        if (!process.env.API_KEY) {
            console.error("API_KEY environment variable not set.");
            alert("API Key is not configured. Please set the API_KEY environment variable.");
            return;
        }
        aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }, []);

    useEffect(() => {
        initializeAi();
    }, [initializeAi]);

    // --- Function Declarations for Gemini ---
    const findNearbyPlacesFunctionDeclaration: FunctionDeclaration = {
        name: 'find_nearby_places',
        parameters: {
            type: Type.OBJECT,
            description: 'Finds nearby places like restaurants, gas stations, or coffee shops based on a query.',
            properties: {
                query: {
                    type: Type.STRING,
                    description: 'The type of place to search for, e.g., "coffee shop", "rest area".',
                },
            },
            required: ['query'],
        },
    };

     const playSpotifySongFunctionDeclaration: FunctionDeclaration = {
        name: 'play_spotify_song',
        parameters: {
            type: Type.OBJECT,
            description: 'Plays a song on Spotify. Use this for any music-related requests.',
            properties: {
                songName: {
                    type: Type.STRING,
                    description: 'The name of the song to play.',
                },
                artist: {
                    type: Type.STRING,
                    description: 'The artist of the song.',
                },
            },
            required: ['songName', 'artist'],
        },
    };
    
    // --- Mock Functions ---
    const mockFunctions: { [key: string]: Function } = {
        find_nearby_places: async (args: { query: string }) => {
            console.log(`Searching for nearby places: ${args.query}`);
            if (!location) {
                return "I can't find nearby places because I don't have your current location.";
            }
             if (!aiRef.current) {
                return "AI service is not initialized.";
            }
            try {
                const response = await aiRef.current.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: `Find a ${args.query} nearby. Provide a brief, conversational summary of the top result.`,
                    config: {
                        tools: [{googleMaps: {}}],
                        toolConfig: {
                            retrievalConfig: {
                                latLng: {
                                    latitude: location.latitude,
                                    longitude: location.longitude,
                                },
                            },
                        },
                    },
                });
                console.log('Grounding Chunks:', response.candidates?.[0]?.groundingMetadata?.groundingChunks);
                return response.text;
            } catch (error) {
                console.error("Error using Maps Grounding:", error);
                return `I had trouble looking that up. Please try again.`;
            }
        },
        play_spotify_song: async (args: { songName: string; artist: string; }) => {
            console.log(`Playing on Spotify: ${args.songName} by ${args.artist}`);
            setCurrentSong({
                title: args.songName,
                artist: args.artist,
                albumArtUrl: `https://picsum.photos/seed/${encodeURIComponent(args.songName)}/200`,
            });
            return `Now playing ${args.songName} by ${args.artist}. Enjoy!`;
        },
    };

    // --- Permissions and Setup ---
    useEffect(() => {
        const setup = async () => {
            try {
                // Load face-api models
                const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                ]);
                setModelsLoaded(true);
                console.log("Face-API models loaded.");

                // Get media permissions
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                navigator.geolocation.watchPosition(
                    (position) => {
                        setLocation({
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                        });
                    },
                    (error) => console.error('Geolocation error:', error),
                    { enableHighAccuracy: true }
                );
                setPermissionsGranted(true);
            } catch (error) {
                console.error('Error during setup.', error);
                alert("This app requires camera, microphone, and location permissions to function. Please grant them and refresh.");
            }
        };
        setup();
    }, []);

    // --- Fatigue Detection Loop ---
    useEffect(() => {
        if (permissionsGranted && modelsLoaded && driverState === DriverState.MONITORING) {
             detectionIntervalRef.current = window.setInterval(async () => {
                if (videoRef.current && !videoRef.current.paused) {
                    const detections = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
                    
                    if (detections) {
                        noFaceFramesRef.current = 0; // Reset counter if face is found
                        const landmarks = detections.landmarks;
                        const leftEye = landmarks.getLeftEye();
                        const rightEye = landmarks.getRightEye();

                        const leftEAR = getEyeAspectRatio(leftEye);
                        const rightEAR = getEyeAspectRatio(rightEye);
                        const ear = (leftEAR + rightEAR) / 2;

                        if (ear < EAR_THRESHOLD) {
                            eyeClosedFramesRef.current++;
                        } else {
                            eyeClosedFramesRef.current = 0;
                        }

                        if (eyeClosedFramesRef.current > CONSECUTIVE_FRAMES_DROWSY) {
                            console.log("Drowsiness detected (long eye closure).");
                            setDriverState(DriverState.DROWSY);
                        }

                    } else {
                        noFaceFramesRef.current++;
                        if (noFaceFramesRef.current > CONSECUTIVE_FRAMES_UNRESPONSIVE) {
                            console.log("Unresponsive detected (no face in view).");
                            setDriverState(DriverState.UNRESPONSIVE);
                        }
                    }
                }
            }, 200);
        } else {
            if (detectionIntervalRef.current) {
                clearInterval(detectionIntervalRef.current);
            }
        }

        return () => {
            if (detectionIntervalRef.current) {
                clearInterval(detectionIntervalRef.current);
            }
        };
    }, [permissionsGranted, modelsLoaded, driverState]);


    const startLiveSession = useCallback(async () => {
        if (!permissionsGranted || !aiRef.current) return;
        setMiraState(MiraState.LISTENING);
        
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const outCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        outputAudioContextRef.current = outCtx;

        const analyser = outCtx.createAnalyser();
        analyser.fftSize = 256;
        setAnalyserNode(analyser);
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        let currentInputTranscription = '';
        let currentOutputTranscription = '';

        sessionPromiseRef.current = aiRef.current.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: () => {
                    const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
                    const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const l = inputData.length;
                        const int16 = new Int16Array(l);
                        for (let i = 0; i < l; i++) {
                            int16[i] = inputData[i] * 32768;
                        }
                        const pcmBlob = {
                            data: encode(new Uint8Array(int16.buffer)),
                            mimeType: 'audio/pcm;rate=16000',
                        };
                        sessionPromiseRef.current?.then((session) => {
                            session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContextRef.current!.destination);
                },
                onmessage: async (message: LiveServerMessage) => {
                    if (message.serverContent?.inputTranscription) {
                        currentInputTranscription += message.serverContent.inputTranscription.text;
                    }
                    if (message.serverContent?.outputTranscription) {
                        currentOutputTranscription += message.serverContent.outputTranscription.text;
                        setMiraState(MiraState.SPEAKING);
                    }
                    if (message.serverContent?.turnComplete) {
                        if (currentInputTranscription.trim()) {
                            setTranscriptions(prev => [...prev, { speaker: 'USER', text: currentInputTranscription.trim() }]);
                        }
                        if (currentOutputTranscription.trim()) {
                            setTranscriptions(prev => [...prev, { speaker: 'MIRA', text: currentOutputTranscription.trim() }]);
                        }
                        currentInputTranscription = '';
                        currentOutputTranscription = '';
                        setMiraState(MiraState.LISTENING);
                    }

                    if (message.toolCall?.functionCalls) {
                        setMiraState(MiraState.THINKING);
                        for (const fc of message.toolCall.functionCalls) {
                            const func = mockFunctions[fc.name];
                            if(func) {
                                const result = await func(fc.args);
                                sessionPromiseRef.current?.then(session => {
                                    session.sendToolResponse({
                                        functionResponses: { id: fc.id, name: fc.name, response: { result } }
                                    })
                                });
                            }
                        }
                    }

                    const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (audioData && outputAudioContextRef.current && analyser) {
                        nextAudioStartTimeRef.current = Math.max(nextAudioStartTimeRef.current, outputAudioContextRef.current.currentTime);
                        const audioBuffer = await decodeAudioData(decode(audioData), outputAudioContextRef.current, 24000, 1);
                        const source = outputAudioContextRef.current.createBufferSource();
                        source.buffer = audioBuffer;
                        
                        source.connect(analyser);
                        analyser.connect(outputAudioContextRef.current.destination);
                        
                        source.addEventListener('ended', () => audioSourcesRef.current.delete(source));
                        source.start(nextAudioStartTimeRef.current);
                        nextAudioStartTimeRef.current += audioBuffer.duration;
                        audioSourcesRef.current.add(source);
                    }
                },
                onerror: (e: ErrorEvent) => console.error('Live session error:', e),
                onclose: (e: CloseEvent) => { 
                    setMiraState(MiraState.IDLE);
                    setAnalyserNode(null);
                    console.log('Live session closed.');
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                systemInstruction: "You are Mira, a friendly and alert AI co-passenger for a driver. Your primary goal is to keep the driver engaged and awake, especially if they seem tired. Be conversational, tell short jokes, or ask questions about their trip. You can also help with hands-free tasks like finding nearby places or playing music. Keep your responses concise and helpful.",
                tools: [{functionDeclarations: [findNearbyPlacesFunctionDeclaration, playSpotifySongFunctionDeclaration]}],
            },
        });
        
        const session = await sessionPromiseRef.current;
        if (driverState === DriverState.DROWSY) {
            session.sendText("The driver seems drowsy. Start a short, engaging conversation to help them stay alert.");
        }

    }, [permissionsGranted, driverState]);


    useEffect(() => {
        if (driverState === DriverState.DROWSY && miraState === MiraState.IDLE) {
            startLiveSession();
            setDriverState(DriverState.ENGAGED);
        }
        if (driverState === DriverState.UNRESPONSIVE && !isEmergency) {
            setIsEmergency(true);
            setEmergencyCountdown(15);
            emergencyTimerRef.current = window.setInterval(() => {
                setEmergencyCountdown(prev => prev - 1);
            }, 1000);
            sessionPromiseRef.current?.then(session => session.sendText("The driver seems unresponsive. Please state clearly if you are okay. An emergency contact will be notified in 15 seconds if there is no response."));
        }
    }, [driverState, miraState, isEmergency, startLiveSession]);
    
    useEffect(() => {
        if (emergencyCountdown <= 0) {
            if (emergencyTimerRef.current) clearInterval(emergencyTimerRef.current);
            console.log(`EMERGENCY: Alerting contact ${emergencyContact} with location:`, location);
            setIsEmergency(false);
            setDriverState(DriverState.MONITORING);
        }
    }, [emergencyCountdown, location]);

    const cancelEmergency = () => {
        if (emergencyTimerRef.current) clearInterval(emergencyTimerRef.current);
        setIsEmergency(false);
        setDriverState(DriverState.MONITORING); // Reset state after emergency is cancelled
        setTranscriptions(prev => [...prev, {speaker: 'USER', text: "I'm okay."}]);
    };

    const getStatusText = () => {
        if (!permissionsGranted) return "Waiting for permissions...";
        if (!modelsLoaded) return "Loading AI Vision Models...";
        if(isEmergency) return `EMERGENCY COUNTDOWN: ${emergencyCountdown}`;
        switch (driverState) {
            case DriverState.DROWSY: return "Drowsiness Detected...";
            case DriverState.UNRESPONSIVE: return "Unresponsive Driver Detected!";
            case DriverState.ENGAGED: return `Talking with Mira...`;
            default: return "Monitoring...";
        }
    }
    
    const isAlertState = driverState === DriverState.UNRESPONSIVE || isEmergency;

    return (
      <div className="min-h-screen w-full text-gray-200 flex flex-col p-4 font-sans max-h-screen">
          <header className="flex justify-between items-center pb-4 shrink-0">
              <h1 className="text-3xl font-bold text-white tracking-wider">DRIVA</h1>
              <div className="flex items-center space-x-4 text-sm">
                  {permissionsGranted && <MicrophoneIcon className="w-5 h-5 text-green-400" />}
                  {location && <LocationIcon className="w-5 h-5 text-blue-400" />}
                  <div className="flex items-center space-x-2 panel px-3 py-1">
                    <PhoneIcon className="w-4 h-4" />
                    <span>Emergency: {emergencyContact}</span>
                  </div>
              </div>
          </header>
  
          <main className="flex-grow flex flex-col gap-4 overflow-hidden">
              <div className={`relative aspect-video bg-black rounded-lg overflow-hidden border border-slate-700 w-full max-w-4xl mx-auto shrink-0 transition-all duration-300 ${isAlertState ? 'glow-border-red' : ''}`}>
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover"></video>
                  <div className="absolute bottom-0 left-0 w-full p-3 bg-gradient-to-t from-black/80 to-transparent">
                      <p className={`text-xl font-semibold text-center ${isAlertState ? 'text-red-400 animate-pulse' : 'text-white'}`}>{getStatusText()}</p>
                  </div>
              </div>
  
              <div className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-hidden">
                   <div className="h-96 lg:h-auto panel">
                      <SpotifyPlayer song={currentSong} />
                   </div>
                  <div className="panel flex flex-col items-center justify-center p-4 order-first lg:order-none">
                     <MiraCore state={miraState} analyserNode={analyserNode} />
                  </div>
                  <div className="h-96 lg:h-auto panel">
                     <LogPanel transcriptions={transcriptions} />
                  </div>
              </div>
          </main>

          {isEmergency && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
                  <div className="bg-red-900 border-2 border-red-500 rounded-lg p-8 text-center shadow-2xl max-w-lg mx-4 glow-border-red">
                      <AlertIcon className="w-16 h-16 text-red-400 mx-auto mb-4 animate-pulse" />
                      <h2 className="text-3xl font-bold text-white mb-2">ARE YOU OKAY?</h2>
                      <p className="text-red-200 mb-6">If you do not respond, your emergency contact will be notified.</p>
                      <div className="text-6xl font-mono font-bold text-white mb-8">{emergencyCountdown}</div>
                      <button onClick={cancelEmergency} className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition duration-200 w-full">
                          I'm Okay
                      </button>
                  </div>
              </div>
          )}
      </div>
    );
  };
  
  export default App;