"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CaptureCamera() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Store the raw blob/file so we can upload it later
  const fileBlobRef = useRef<Blob | null>(null);
  const fileNameRef = useRef<string>("capture.jpg");

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<{ name: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;

    if (!cameraActive || !video || !stream) return;

    video.srcObject = stream;

    video.play().catch((error) => {
      console.error("Could not play camera stream:", error);
    });
  }, [cameraActive]);

  async function startCamera() {
    try {
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: "environment",
          },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraActive(true);
    } catch (error) {
      console.error(error);
      setError("Camera access was denied or is unavailable.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
  }

  function takePhoto() {
    const video = videoRef.current;

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    const canvas = document.createElement("canvas");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;

        if (photoUrl) {
          URL.revokeObjectURL(photoUrl);
        }

        fileBlobRef.current = blob;
        fileNameRef.current = "capture.jpg";

        const newPhotoUrl = URL.createObjectURL(blob);
        setPhotoUrl(newPhotoUrl);

        stopCamera();
      },
      "image/jpeg",
      0.9,
    );
  }

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (photoUrl) {
      URL.revokeObjectURL(photoUrl);
    }

    fileBlobRef.current = file;
    fileNameRef.current = file.name;

    setPhotoUrl(URL.createObjectURL(file));
    setError(null);

    event.target.value = "";
  }

  function handlePdfUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (pdfFile) {
      URL.revokeObjectURL(pdfFile.url);
    }

    fileBlobRef.current = file;
    fileNameRef.current = file.name;

    setPdfFile({ name: file.name, url: URL.createObjectURL(file) });
    setError(null);
    event.target.value = "";
  }

  function retakePhoto() {
    if (photoUrl) {
      URL.revokeObjectURL(photoUrl);
    }

    fileBlobRef.current = null;
    setPhotoUrl(null);
    startCamera();
  }

  function clearPhoto() {
    if (photoUrl) {
      URL.revokeObjectURL(photoUrl);
    }

    fileBlobRef.current = null;
    setPhotoUrl(null);
  }

  function clearPdf() {
    if (pdfFile) {
      URL.revokeObjectURL(pdfFile.url);
    }

    fileBlobRef.current = null;
    setPdfFile(null);
  }

  async function processFile() {
    const blob = fileBlobRef.current;
    if (!blob) return;

    setProcessing(true);
    setError(null);

    try {
      // Get user ID if authenticated
      let userId: string | null = null;
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        userId = data.user?.id ?? null;
      } catch {
        // Demo mode — no auth
      }

      const formData = new FormData();
      formData.append("file", blob, fileNameRef.current);
      if (userId) {
        formData.append("userId", userId);
      }

      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Processing failed.");
      }

      router.push("/study");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed.");
    } finally {
      setProcessing(false);
    }
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      if (pdfFile) URL.revokeObjectURL(pdfFile.url);
    };
  }, []);

  return (
    <section className="flex flex-col gap-4">
      {!cameraActive && !photoUrl && !pdfFile && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={startCamera}
            className="rounded-lg bg-primary px-4 py-3 text-primary-foreground"
          >
            Open camera
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border px-4 py-3"
          >
            Upload photo
          </button>

          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            className="rounded-lg border px-4 py-3"
          >
            Upload PDF
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />

          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            onChange={handlePdfUpload}
            className="hidden"
          />
        </div>
      )}

      {cameraActive && (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="aspect-[3/4] w-full rounded-xl bg-black object-cover"
          />

          <button
            type="button"
            onClick={takePhoto}
            className="rounded-lg bg-primary px-4 py-3 text-primary-foreground"
          >
            Take picture
          </button>

          <button
            type="button"
            onClick={stopCamera}
            className="rounded-lg border px-4 py-3"
          >
            Cancel
          </button>
        </>
      )}

      {photoUrl && (
        <>
          <img
            src={photoUrl}
            alt="Captured preview"
            className="aspect-[3/4] w-full rounded-xl object-cover"
          />

          <button
            type="button"
            onClick={processFile}
            disabled={processing}
            className="rounded-lg bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
          >
            {processing ? "Generating flashcards..." : "Generate Flashcards"}
          </button>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={retakePhoto}
              disabled={processing}
              className="flex-1 rounded-lg border px-4 py-3"
            >
              Retake
            </button>

            <button
              type="button"
              onClick={clearPhoto}
              disabled={processing}
              className="flex-1 rounded-lg border px-4 py-3"
            >
              Clear
            </button>
          </div>
        </>
      )}

      {pdfFile && (
        <>
          <div className="flex items-center gap-3 rounded-xl border p-4">
            <span className="text-2xl">PDF</span>
            <span className="min-w-0 flex-1 truncate text-sm">{pdfFile.name}</span>
          </div>

          <button
            type="button"
            onClick={processFile}
            disabled={processing}
            className="rounded-lg bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
          >
            {processing ? "Generating flashcards..." : "Generate Flashcards"}
          </button>

          <button
            type="button"
            onClick={clearPdf}
            disabled={processing}
            className="rounded-lg border px-4 py-3"
          >
            Clear
          </button>
        </>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </section>
  );
}
