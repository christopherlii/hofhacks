import React, { useRef, useState, useCallback } from 'react';
import { Camera, X, Check, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';

interface CameraCaptureProps {
  onCapture: (photo: { blob: Blob; dataUrl: string; timestamp: Date }) => void;
  onCancel: () => void;
  title?: string;
  instructions?: string;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  onCapture,
  onCancel,
  title = 'Take a Photo',
  instructions = 'Take a clear photo of the food order',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Initialize camera
  const initializeCamera = useCallback(async () => {
    try {
      setError(null);
      setIsInitializing(true);
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
      
      setStream(mediaStream);
      setIsInitializing(false);
    } catch (err) {
      console.error('Camera error:', err);
      setError('Unable to access camera. Please grant camera permissions.');
      setIsInitializing(false);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  // Capture photo
  const handleCapture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    context.drawImage(video, 0, 0);

    // Convert to data URL
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedPhoto(dataUrl);

    // Stop the camera stream
    stopCamera();
  }, [stopCamera]);

  // Retake photo
  const handleRetake = useCallback(() => {
    setCapturedPhoto(null);
    initializeCamera();
  }, [initializeCamera]);

  // Confirm and submit photo
  const handleConfirm = useCallback(async () => {
    if (!capturedPhoto || !canvasRef.current) return;

    // Convert data URL to blob
    const response = await fetch(capturedPhoto);
    const blob = await response.blob();

    onCapture({
      blob,
      dataUrl: capturedPhoto,
      timestamp: new Date(),
    });
  }, [capturedPhoto, onCapture]);

  // Initialize on mount
  React.useEffect(() => {
    initializeCamera();
    return () => stopCamera();
  }, []);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="bg-black/80 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => {
            stopCamera();
            onCancel();
          }}
          className="p-2 text-white"
        >
          <X className="w-6 h-6" />
        </button>
        <div className="text-center">
          <h3 className="text-white font-semibold">{title}</h3>
          <p className="text-white/70 text-sm">{instructions}</p>
        </div>
        <div className="w-10" /> {/* Spacer for centering */}
      </div>

      {/* Camera View / Captured Photo */}
      <div className="flex-1 relative">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="text-center">
              <p className="text-white mb-4">{error}</p>
              <Button variant="secondary" onClick={initializeCamera}>
                Try Again
              </Button>
            </div>
          </div>
        ) : capturedPhoto ? (
          <img
            src={capturedPhoto}
            alt="Captured"
            className="w-full h-full object-contain"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {isInitializing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-white">Starting camera...</div>
              </div>
            )}
          </>
        )}

        {/* Hidden canvas for capturing */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Controls */}
      <div className="bg-black/80 px-4 py-6">
        {capturedPhoto ? (
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="secondary"
              size="lg"
              onClick={handleRetake}
              leftIcon={<RefreshCw className="w-5 h-5" />}
            >
              Retake
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={handleConfirm}
              leftIcon={<Check className="w-5 h-5" />}
              className="bg-green-600 hover:bg-green-700"
            >
              Use Photo
            </Button>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={handleCapture}
              disabled={isInitializing || !!error}
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-50"
            >
              <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center">
                <Camera className="w-8 h-8 text-gray-900" />
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
