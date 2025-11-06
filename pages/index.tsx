"use client";

import { useEffect, useState, useRef } from "react";

interface VerseData {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  translation?: string;
}

interface WebSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
  onend: (() => void) | null;
}

export default function HomePage() {
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>("");
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [output, setOutput] = useState<VerseData[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState("");

  console.log("[HomePage] Component render - State:", { isListening, status, transcript, outputCount: output.length });

  const recRef = useRef<WebSpeechRecognition | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // -----------------------------
  // List microphones
  // -----------------------------
  const listMics = async () => {
    console.log("[listMics] Starting microphone enumeration...");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[listMics] User media permission granted");
      const devices = await navigator.mediaDevices.enumerateDevices();
      const micDevices = devices.filter(d => d.kind === "audioinput");
      console.log("[listMics] Found microphones:", micDevices.length, micDevices.map(m => ({ id: m.deviceId, label: m.label })));
      setMics(micDevices);
      if (!selectedMic && micDevices.length > 0) {
        console.log("[listMics] Setting default microphone:", micDevices[0].deviceId);
        setSelectedMic(micDevices[0].deviceId);
      }
    } catch (err) {
      console.error("[listMics] Error:", err);
    }
  };

  useEffect(() => { listMics(); }, []);

  // -----------------------------
  // Fetch LLM API whenever transcript changes
  // -----------------------------
  useEffect(() => {
    if (!transcript) {
      console.log("[fetchVerse] No transcript, skipping fetch");
      return;
    }

    console.log("[fetchVerse] Transcript changed, fetching verse:", transcript);
    const controller = new AbortController();

    const fetchVerse = async () => {
      setStatus("Fetching...");
      
      // Log the transcript being sent to API
      const requestBody = { transcript };
      console.log("═══════════════════════════════════════════════════════");
      console.log("[API REQUEST] Sending transcript to /api endpoint:");
      console.log("Transcript:", transcript);
      console.log("Request Body:", JSON.stringify(requestBody, null, 2));
      console.log("═══════════════════════════════════════════════════════");
      
      try {
        const res = await fetch("/api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        console.log("[API RESPONSE] Status:", res.status, res.statusText);
        
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        
        let rawText = await res.text(); // get raw string
        console.log("═══════════════════════════════════════════════════════");
        console.log("[API RESPONSE] Raw response text:");
        console.log(rawText);
        console.log("═══════════════════════════════════════════════════════");
        
      // remove code block markdown if present
        let cleanedText = rawText
          .replace(/^```json\s*/i, "")  // Remove opening ```json (case insensitive)
          .replace(/^```\s*/i, "")      // Remove opening ``` if no lang specified
          .replace(/\s*```$/g, "")      // Remove closing ``` at end
          .trim();                      // Remove any extra whitespace
        console.log("[API RESPONSE] Cleaned text (after removing markdown):", cleanedText);
        
        const verse: VerseData = JSON.parse(cleanedText);
        console.log("═══════════════════════════════════════════════════════");
        console.log("[API RESPONSE] Parsed verse data:");
        console.log(JSON.stringify(verse, null, 2));
        console.log("═══════════════════════════════════════════════════════");
        const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setOutput(prev => {
          const newOutput = [{ ...verse,translation : `${timestamp}${verse.translation ? " | " + verse.translation : ""}` }, ...prev];
          console.log("[fetchVerse] Updated output array, count:", newOutput.length);
          return newOutput;
        });
        setStatus("Idle");
        console.log("[fetchVerse] Fetch completed successfully");
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("[fetchVerse] Error:", err);
          setStatus("Error: " + err.message);
        } else {
          console.log("[fetchVerse] Request aborted");
        }
      }
    };

    fetchVerse();
    return () => {
      console.log("[fetchVerse] Cleanup: aborting request");
      controller.abort();
    };
  }, [transcript]);

  // -----------------------------
  // Audio Meter
  // -----------------------------
  const startAudioMeter = (stream: MediaStream) => {
    console.log("[startAudioMeter] Initializing audio meter");
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray: Uint8Array<ArrayBuffer> = new Uint8Array(bufferLength);
    source.connect(analyser);
    console.log("[startAudioMeter] Audio meter initialized, buffer length:", bufferLength);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    dataArrayRef.current = dataArray;

    const updateLevel = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArrayRef.current as Uint8Array<ArrayBuffer>);
      const sum = dataArrayRef.current.reduce((acc, val) => acc + val * val, 0);
      const rms = Math.sqrt(sum / dataArrayRef.current.length);
      setAudioLevel(Math.min(rms / 128, 1));
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };
    updateLevel();
  };

  const stopAudioMeter = () => {
    console.log("[stopAudioMeter] Stopping audio meter");
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    dataArrayRef.current = null;
    setAudioLevel(0);
    console.log("[stopAudioMeter] Audio meter stopped");
  };

  // -----------------------------
  // Start Listening (STT)
  // -----------------------------
  const startListening = async () => {
    console.log("[startListening] Starting speech recognition, selected mic:", selectedMic);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: selectedMic ? { deviceId: selectedMic } : true });
      console.log("[startListening] Media stream obtained");
      streamRef.current = stream;
      startAudioMeter(stream);

      const RecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!RecognitionCtor) { 
        console.error("[startListening] SpeechRecognition not supported");
        alert("SpeechRecognition not supported."); 
        stopAudioMeter(); 
        return; 
      }

      const rec = new RecognitionCtor() as WebSpeechRecognition;
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.continuous = true;
      console.log("[startListening] Speech recognition instance created");

      rec.onresult = (ev: any) => {
        let partial = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) partial += ev.results[i][0].transcript + " ";
        console.log("[startListening] Speech result:", { resultIndex: ev.resultIndex, resultCount: ev.results.length, transcript: partial });
        
        // Log when transcript is set (this will trigger API call)
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("[TRANSCRIPT UPDATE] Speech recognition transcript captured:");
        console.log("Transcript:", partial);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        setTranscript(partial);
        setStatus("Listening…");
      };

      rec.onerror = e => { 
        console.error("[startListening] Speech recognition error:", e); 
        setStatus("Error: " + e.error); 
      };
      rec.onend = () => {
        console.log("[startListening] Speech recognition ended");
        setStatus("Stopped");
      };

      rec.start();
      console.log("[startListening] Speech recognition started");
      recRef.current = rec;
      setIsListening(true);
      setStatus("Listening on selected mic...");
    } catch (err) {
      console.error("[startListening] Error starting:", err);
      setStatus("Error: Failed to start");
      stopAudioMeter();
    }
  };

  const stopListening = () => {
    console.log("[stopListening] Stopping speech recognition");
    recRef.current?.stop(); 
    recRef.current = null;
    streamRef.current?.getTracks().forEach(t => {
      console.log("[stopListening] Stopping media track:", t.kind);
      t.stop();
    });
    streamRef.current = null;
    stopAudioMeter();
    setIsListening(false);
    setStatus("Stopped");
    console.log("[stopListening] Speech recognition stopped");
  };

  // -----------------------------
  // Correct/Wrong buttons for training
  // -----------------------------
  const submitTraining = (verse: VerseData, correct: boolean) => {
    console.log("[submitTraining] Submitting feedback:", { correct, verse, transcript });
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, training: { output: verse, correct } }),
    })
    .then(async (res) => {
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(`HTTP ${res.status}: ${errorData.error || res.statusText}`);
      }
      return res.json();
    })
    .then((data) => {
      console.log("[submitTraining] Training feedback logged successfully", data);
    })
    .catch(err => {
      console.error("[submitTraining] Error submitting feedback:", err);
    });
  };

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-2xl font-semibold mb-4">🎧 Bible Citation + LLM Demo</h1>

      {/* Audio Input */}
      <div className="mb-4 flex items-center space-x-2">
        <label htmlFor="micSelect" className="font-medium">🎙️ Select Audio Input:</label>
        <select id="micSelect" value={selectedMic} onChange={e => {
          console.log("[micSelect] Microphone changed:", e.target.value);
          setSelectedMic(e.target.value);
        }} className="border border-gray-300 rounded px-2 py-1">
          {mics.map((mic, i) => <option key={mic.deviceId} value={mic.deviceId}>{mic.label || `Microphone ${i + 1}`}</option>)}
        </select>
        <button onClick={listMics} className="bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded">🔄 Refresh</button>
      </div>

      {/* Audio Meter */}
      <div className="w-full bg-gray-200 rounded-full h-3 mb-1 overflow-hidden">
        <div className="bg-green-500 h-3 transition-all duration-100" style={{ width: `${Math.min(audioLevel*100, 100)}%` }}></div>
      </div>
      <div className="text-xs text-gray-500 mb-6">Mic Level: {(audioLevel*100).toFixed(0)}%</div>

      {/* Controls */}
      <div className="space-x-2 mb-2">
        <button onClick={startListening} disabled={isListening} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded disabled:opacity-50">▶️ Start Listening</button>
        <button onClick={stopListening} disabled={!isListening} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded disabled:opacity-50">⏹️ Stop</button>
      </div>

      <div className="text-gray-500 mb-6">Status: {status}</div>

      {/* Output */}
      <div className="space-y-4">
        {output.map((verse, i) => (
          <div key={i} className="bg-white shadow-sm rounded-xl p-4 border border-gray-100">
            <div className="text-sm text-gray-600">{verse.book} {verse.chapter}:{verse.verse}</div>
            <div className="text-lg mt-2">{verse.text}</div>
            {verse.translation && <div className="text-sm text-gray-500 mt-2">{verse.translation}</div>}
            <div className="mt-3 space-x-2">
              <button onClick={() => submitTraining(verse, true)} className="bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-sm">✓ Correct</button>
              <button onClick={() => submitTraining(verse, false)} className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-sm">✗ Wrong</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
