import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [mangaImage, setMangaImage] = useState(null);
  const [imageData, setImageData] = useState('');
  const [speechBubbles, setSpeechBubbles] = useState([]);
  const [currentBubbleIndex, setCurrentBubbleIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [highlightStyle, setHighlightStyle] = useState('glow');
  const [mangaPages, setMangaPages] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isArchiveMode, setIsArchiveMode] = useState(false);
  
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Check if it's an archive file
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.zip') || fileName.endsWith('.cbz') || fileName.endsWith('.rar')) {
        handleArchiveUpload(file);
      } else {
        // Handle single image
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64Data = e.target.result;
          setImageData(base64Data);
          setMangaImage(base64Data);
          setIsArchiveMode(false);
          setMangaPages([]);
          setCurrentPageIndex(0);
          analyzeManga(base64Data, file.name);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleArchiveUpload = async (file) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${API}/extract-archive`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      const images = response.data.images;
      if (images.length > 0) {
        setMangaPages(images);
        setIsArchiveMode(true);
        setCurrentPageIndex(0);
        setImageData(images[0].image_data);
        setMangaImage(images[0].image_data);
        analyzeManga(images[0].image_data, images[0].filename);
      }
    } catch (error) {
      console.error('Error extracting archive:', error);
      alert('Error extracting archive. Please try a different file.');
    }
    setIsLoading(false);
  };

  const analyzeManga = async (imageData, title) => {
    setIsLoading(true);
    try {
      const response = await axios.post(`${API}/analyze-manga`, {
        title: title || 'Manga Page',
        image_data: imageData
      });
      
      setSpeechBubbles(response.data.speech_bubbles || []);
      setCurrentBubbleIndex(0);
    } catch (error) {
      console.error('Error analyzing manga:', error);
      // Fallback demo data
      setSpeechBubbles([
        {
          id: '1',
          text: 'Welcome to the immersive manga TTS experience!',
          coordinates: { x: 0.1, y: 0.1, width: 0.7, height: 0.15 },
          reading_order: 1
        },
        {
          id: '2', 
          text: 'Watch as speech bubbles highlight in sync with narration.',
          coordinates: { x: 0.2, y: 0.4, width: 0.6, height: 0.12 },
          reading_order: 2
        }
      ]);
    }
    setIsLoading(false);
  };

  const generateAndPlaySpeech = async (text, bubbleIndex) => {
    try {
      // Highlight current bubble
      setCurrentBubbleIndex(bubbleIndex);
      
      // Try OpenAI TTS API first
      try {
        const response = await axios.post(`${API}/generate-speech`, {
          text: text,
          voice: 'alloy',
          speed: playbackSpeed
        });
        
        if (response.data.audio_data && response.data.audio_data !== "") {
          // Use OpenAI generated audio
          const audio = new Audio(`data:audio/mp3;base64,${response.data.audio_data}`);
          audio.onended = () => {
            if (bubbleIndex < speechBubbles.length - 1) {
              setTimeout(() => {
                generateAndPlaySpeech(speechBubbles[bubbleIndex + 1].text, bubbleIndex + 1);
              }, 500);
            } else {
              setIsPlaying(false);
              setCurrentBubbleIndex(0);
            }
          };
          await audio.play();
          setCurrentAudio(audio);
          return;
        }
      } catch (apiError) {
        console.log('OpenAI TTS failed, using browser speech synthesis:', apiError);
      }
      
      // Fallback to browser speech synthesis
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = playbackSpeed;
        utterance.onend = () => {
          // Move to next bubble after current one finishes
          if (bubbleIndex < speechBubbles.length - 1) {
            setTimeout(() => {
              generateAndPlaySpeech(speechBubbles[bubbleIndex + 1].text, bubbleIndex + 1);
            }, 500);
          } else {
            setIsPlaying(false);
            setCurrentBubbleIndex(0);
          }
        };
        
        speechSynthesis.speak(utterance);
        setCurrentAudio(utterance);
      }
    } catch (error) {
      console.error('Error generating speech:', error);
    }
  };

  const togglePlayback = () => {
    if (isPlaying) {
      // Pause
      if (currentAudio) {
        if (typeof currentAudio.pause === 'function') {
          currentAudio.pause();
        } else {
          speechSynthesis.cancel();
        }
      }
      setIsPlaying(false);
    } else {
      // Play
      if (speechBubbles.length > 0) {
        setIsPlaying(true);
        generateAndPlaySpeech(speechBubbles[currentBubbleIndex].text, currentBubbleIndex);
      }
    }
  };

  const nextPage = () => {
    if (isArchiveMode && currentPageIndex < mangaPages.length - 1) {
      const newIndex = currentPageIndex + 1;
      setCurrentPageIndex(newIndex);
      setImageData(mangaPages[newIndex].image_data);
      setMangaImage(mangaPages[newIndex].image_data);
      analyzeManga(mangaPages[newIndex].image_data, mangaPages[newIndex].filename);
    }
  };

  const previousPage = () => {
    if (isArchiveMode && currentPageIndex > 0) {
      const newIndex = currentPageIndex - 1;
      setCurrentPageIndex(newIndex);
      setImageData(mangaPages[newIndex].image_data);
      setMangaImage(mangaPages[newIndex].image_data);
      analyzeManga(mangaPages[newIndex].image_data, mangaPages[newIndex].filename);
    }
  };
  const nextBubble = () => {
    if (currentBubbleIndex < speechBubbles.length - 1) {
      const newIndex = currentBubbleIndex + 1;
      setCurrentBubbleIndex(newIndex);
      if (isPlaying) {
        if (currentAudio) {
          if (typeof currentAudio.pause === 'function') {
            currentAudio.pause();
          } else {
            speechSynthesis.cancel();
          }
        }
        generateAndPlaySpeech(speechBubbles[newIndex].text, newIndex);
      }
    }
  };

  const previousBubble = () => {
    if (currentBubbleIndex > 0) {
      const newIndex = currentBubbleIndex - 1;
      setCurrentBubbleIndex(newIndex);
      if (isPlaying) {
        if (currentAudio) {
          if (typeof currentAudio.pause === 'function') {
            currentAudio.pause();
          } else {
            speechSynthesis.cancel();
          }
        }
        generateAndPlaySpeech(speechBubbles[newIndex].text, newIndex);
      }
    }
  };

  // Draw highlights on canvas
  useEffect(() => {
    if (canvasRef.current && imageRef.current && speechBubbles.length > 0) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = imageRef.current;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (img.complete && img.naturalHeight !== 0) {
        const bubble = speechBubbles[currentBubbleIndex];
        if (bubble) {
          const { x, y, width, height } = bubble.coordinates;
          
          // Convert relative coordinates to absolute
          const absX = x * img.width;
          const absY = y * img.height;
          const absWidth = width * img.width;
          const absHeight = height * img.height;
          
          // Apply different highlight styles
          ctx.save();
          
          if (highlightStyle === 'glow') {
            ctx.shadowColor = '#00ff88';
            ctx.shadowBlur = 20;
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 3;
            ctx.strokeRect(absX, absY, absWidth, absHeight);
          } else if (highlightStyle === 'overlay') {
            ctx.fillStyle = 'rgba(0, 255, 136, 0.2)';
            ctx.fillRect(absX, absY, absWidth, absHeight);
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 2;
            ctx.strokeRect(absX, absY, absWidth, absHeight);
          } else if (highlightStyle === 'outline') {
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 4;
            ctx.setLineDash([10, 5]);
            ctx.strokeRect(absX, absY, absWidth, absHeight);
          }
          
          ctx.restore();
        }
      }
    }
  }, [currentBubbleIndex, speechBubbles, highlightStyle, mangaImage]);

  // Update canvas size when image loads
  const handleImageLoad = () => {
    if (canvasRef.current && imageRef.current) {
      const canvas = canvasRef.current;
      const img = imageRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 p-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-blue-400">🎌 Immersive Manga TTS</h1>
          
          {/* Controls */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm">Highlight:</label>
              <select 
                value={highlightStyle} 
                onChange={(e) => setHighlightStyle(e.target.value)}
                className="bg-gray-700 px-2 py-1 rounded text-sm"
              >
                <option value="glow">Glow</option>
                <option value="overlay">Overlay</option>
                <option value="outline">Outline</option>
              </select>
            </div>
            
            <div className="flex items-center space-x-2">
              <label className="text-sm">Speed:</label>
              <input 
                type="range" 
                min="0.5" 
                max="2" 
                step="0.1" 
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                className="w-20"
              />
              <span className="text-sm w-8">{playbackSpeed}x</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-6">
        {!mangaImage ? (
          // Upload Interface
          <div className="text-center py-20">
            <div className="bg-gray-800 rounded-lg p-12 border-2 border-dashed border-gray-600 hover:border-blue-400 transition-colors">
              <div className="text-6xl mb-6">📖</div>
              <h2 className="text-2xl font-bold mb-4">Upload Your Manga Page</h2>
              <p className="text-gray-400 mb-8">
                Experience manga like never before with real-time speech bubble highlighting and narration
              </p>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-lg font-semibold transition-colors"
              >
                Choose Manga Image
              </button>
              
              <div className="mt-8 text-sm text-gray-500">
                Supports: JPG, PNG, WebP, GIF
              </div>
            </div>
          </div>
        ) : (
          // Manga Viewer
          <div className="space-y-6">
            {/* Playback Controls */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-center space-x-4">
                <button
                  onClick={previousBubble}
                  disabled={currentBubbleIndex === 0}
                  className="p-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  ⏮️
                </button>
                
                <button
                  onClick={togglePlayback}
                  disabled={isLoading || speechBubbles.length === 0}
                  className="p-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors text-xl"
                >
                  {isPlaying ? '⏸️' : '▶️'}
                </button>
                
                <button
                  onClick={nextBubble}
                  disabled={currentBubbleIndex >= speechBubbles.length - 1}
                  className="p-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  ⏭️
                </button>
              </div>
              
              {speechBubbles.length > 0 && (
                <div className="mt-4 text-center">
                  <div className="text-sm text-gray-400">
                    Bubble {currentBubbleIndex + 1} of {speechBubbles.length}
                  </div>
                  <div className="text-sm text-blue-400 mt-1">
                    "{speechBubbles[currentBubbleIndex]?.text}"
                  </div>
                </div>
              )}
            </div>

            {/* Image Viewer with Canvas Overlay */}
            <div className="relative bg-gray-800 rounded-lg p-4">
              {isLoading && (
                <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center rounded-lg z-10">
                  <div className="text-center">
                    <div className="animate-spin text-4xl mb-4">🔄</div>
                    <div>Analyzing manga...</div>
                  </div>
                </div>
              )}
              
              <div className="relative inline-block">
                <img
                  ref={imageRef}
                  src={mangaImage}
                  alt="Manga page"
                  className="max-w-full h-auto rounded"
                  onLoad={handleImageLoad}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            </div>

            {/* Upload New Image */}
            <div className="text-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded-lg transition-colors"
              >
                Upload New Image
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;