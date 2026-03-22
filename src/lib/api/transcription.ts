export async function getAssemblyAITokenWrapper(): Promise<string> {
    const response = await fetch("/api/transcription/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get AssemblyAI token: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.token;
}

export async function processGroqAudioWrapper(file: Blob): Promise<any> {
    const formData = new FormData();
    formData.append('file', file, 'audio.webm');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'json');
    formData.append('language', 'en');

    const response = await fetch("/api/transcription/groq", {
        method: "POST",
        body: formData, // the browser sets the correct Content-Type (multipart/form-data with boundary) automatically
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error: ${response.status} ${errorText}`);
    }

    return response.json();
}
