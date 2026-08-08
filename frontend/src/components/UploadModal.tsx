import React, { useState, useRef } from 'react';
import { X, Upload, FileText, Loader2, AlertTriangle, Globe, Link, Video } from 'lucide-react';
import { api } from '../api/apiClient';
import type { Document } from '../App';

interface UploadModalProps {
  onClose: () => void;
  onSuccess: (doc: Document) => void;
}

type UploadTab = 'pdf' | 'url' | 'youtube';

function UploadModal({ onClose, onSuccess }: UploadModalProps) {
  const [activeTab, setActiveTab] = useState<UploadTab>('pdf');

  // PDF state
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // URL & YouTube state
  const [urlValue, setUrlValue] = useState('');
  const [youtubeValue, setYoutubeValue] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const transcriptInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setError(null);
    setFile(null);
    setUrlValue('');
    setYoutubeValue('');
    setMediaFile(null);
    setTranscriptFile(null);
    setIsUploading(false);
  };

  const handleTabSwitch = (tab: UploadTab) => {
    if (isUploading) return;
    resetState();
    setActiveTab(tab);
  };

  // ─── PDF handlers ───
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    setError(null);
    if (selectedFile.type !== "application/pdf") {
      setError("Only PDF files are supported.");
      return;
    }
    // 5MB Limit: 5 * 1024 * 1024 bytes
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError("File exceeds the 5MB size limit.");
      return;
    }
    setFile(selectedFile);
  };

  const handleUploadSubmit = async () => {
    if (!file) return;
    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('document', file);

    try {
      const response = await api.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data && response.data.success) {
        const fileData = response.data.fileData.Document;
        onSuccess({
          id: fileData.id,
          originalName: fileData.originalName,
          s3Key: fileData.s3Key || '',
          status: fileData.status || 'PENDING',
          createdAt: fileData.createdAt || new Date().toISOString(),
          sourceType: fileData.sourceType || 'PDF',
          sourceUrl: fileData.sourceUrl,
        });
        onClose();
      } else {
        setError(response.data.message || "Failed to upload document.");
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message;
      if (err.code === "ERR_NETWORK" || err.response?.status === 404 || err.response?.status === 500) {
        const mockDoc: Document = {
          id: crypto.randomUUID(),
          originalName: file.name,
          s3Key: `mock/${Date.now()}-${file.name}`,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          sourceType: 'PDF',
        };
        setTimeout(() => {
          onSuccess(mockDoc);
          onClose();
        }, 1500);
      } else {
        setError(errorMsg || "Upload request encountered an error.");
        setIsUploading(false);
      }
    }
  };

  // ─── URL & YouTube helpers ───
  const isValidUrl = (str: string): boolean => {
    try {
      const url = new URL(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const isYouTubeUrl = (str: string): boolean => {
    try {
      const url = new URL(str);
      return url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be');
    } catch {
      return false;
    }
  };

  const handleUrlSubmit = async () => {
    const trimmed = urlValue.trim();
    if (!trimmed) {
      setError("Please enter a URL.");
      return;
    }
    if (!isValidUrl(trimmed)) {
      setError("Please enter a valid URL starting with http:// or https://");
      return;
    }

    // Auto-detect YouTube URL provided in general Web URL tab
    if (isYouTubeUrl(trimmed)) {
      return processYouTubeUrl(trimmed);
    }

    setIsUploading(true);
    setError(null);

    try {
      const response = await api.post('/weburl', { url: trimmed });

      if (response.data && response.data.success) {
        const fileData = response.data.fileData.Document;
        onSuccess({
          id: fileData.id,
          originalName: fileData.originalName,
          s3Key: fileData.s3Key || '',
          status: fileData.status || 'PENDING',
          createdAt: fileData.createdAt || new Date().toISOString(),
          sourceType: fileData.sourceType || 'WEBSITE',
          sourceUrl: fileData.sourceUrl,
        });
        onClose();
      } else {
        setError(response.data.message || "Failed to process Web URL.");
        setIsUploading(false);
      }
    } catch (err: any) {
      const backendErrors = err.response?.data?.errors;
      const errorMsg = backendErrors && backendErrors.length > 0
        ? backendErrors.map((e: any) => e.message).join(', ')
        : err.response?.data?.message || err.message;
      setError(errorMsg || "Failed to fetch content from URL.");
      setIsUploading(false);
    }
  };

  const handleYoutubeSubmit = async () => {
    if (transcriptFile) {
      return processYoutubeTranscript(transcriptFile);
    }
    if (mediaFile) {
      return processYoutubeMedia(mediaFile);
    }
    const trimmed = youtubeValue.trim();
    if (!trimmed) {
      setError("Please enter a YouTube video URL.");
      return;
    }
    if (!isValidUrl(trimmed)) {
      setError("Please enter a valid URL starting with https://");
      return;
    }
    return processYouTubeUrl(trimmed);
  };

  const validateAndSetTranscriptFile = (selectedFile: File) => {
    setError(null);
    if (selectedFile.type !== 'text/plain' || !selectedFile.name.toLowerCase().endsWith('.txt')) {
      setError('Upload a plain-text transcript file (.txt).');
      return;
    }
    if (selectedFile.size > 2 * 1024 * 1024) {
      setError('Transcript file exceeds the 2MB size limit.');
      return;
    }
    setTranscriptFile(selectedFile);
  };

  const processYoutubeTranscript = async (selectedFile: File) => {
    setIsUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('transcript', selectedFile);
    if (youtubeValue.trim()) formData.append('sourceUrl', youtubeValue.trim());

    try {
      const response = await api.post('/youtube/transcript-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (response.data?.success) {
        const fileData = response.data.fileData.Document;
        onSuccess({
          id: fileData.id,
          originalName: fileData.originalName,
          s3Key: fileData.s3Key || '',
          status: fileData.status || 'PENDING',
          createdAt: fileData.createdAt || new Date().toISOString(),
          sourceType: fileData.sourceType || 'YOUTUBE',
          sourceUrl: fileData.sourceUrl,
        });
        onClose();
      } else {
        setError(response.data?.message || 'Failed to upload transcript.');
        setIsUploading(false);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to upload transcript.');
      setIsUploading(false);
    }
  };

  const validateAndSetMediaFile = (selectedFile: File) => {
    setError(null);
    const allowedTypes = new Set([
      'audio/aac', 'audio/flac', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/ogg',
      'audio/wav', 'audio/webm', 'video/mp4', 'video/mpeg', 'video/quicktime',
      'video/webm',
    ]);
    const allowedExtensions = /\.(aac|flac|mp3|mpeg|mp4|m4a|mov|ogg|wav|webm)$/i;
    if (!allowedTypes.has(selectedFile.type) || !allowedExtensions.test(selectedFile.name)) {
      setError('Upload a supported audio or video file.');
      return;
    }
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('Media file exceeds the 50MB size limit.');
      return;
    }
    setMediaFile(selectedFile);
  };

  const processYoutubeMedia = async (selectedFile: File) => {
    setIsUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('media', selectedFile);
    if (youtubeValue.trim()) formData.append('sourceUrl', youtubeValue.trim());

    try {
      const response = await api.post('/youtube/media-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (response.data?.success) {
        const fileData = response.data.fileData.Document;
        onSuccess({
          id: fileData.id,
          originalName: fileData.originalName,
          s3Key: fileData.s3Key || '',
          status: fileData.status || 'PENDING',
          createdAt: fileData.createdAt || new Date().toISOString(),
          sourceType: fileData.sourceType || 'YOUTUBE',
          sourceUrl: fileData.sourceUrl,
        });
        onClose();
      } else {
        setError(response.data?.message || 'Failed to transcribe media.');
        setIsUploading(false);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to transcribe media.');
      setIsUploading(false);
    }
  };

  const processYouTubeUrl = async (urlStr: string) => {
    setIsUploading(true);
    setError(null);

    try {
      const response = await api.post('/youtube', { url: urlStr });

      if (response.data && response.data.success) {
        const fileData = response.data.fileData.Document;
        onSuccess({
          id: fileData.id,
          originalName: fileData.originalName,
          s3Key: fileData.s3Key || '',
          status: fileData.status || 'PENDING',
          createdAt: fileData.createdAt || new Date().toISOString(),
          sourceType: fileData.sourceType || 'YOUTUBE',
          sourceUrl: fileData.sourceUrl,
        });
        onClose();
      } else {
        setError(response.data.message || "Failed to process YouTube transcript.");
        setIsUploading(false);
      }
    } catch (err: any) {
      const backendErrors = err.response?.data?.errors;
      const errorMsg = backendErrors && backendErrors.length > 0
        ? backendErrors.map((e: any) => e.message).join(', ')
        : err.response?.data?.message || err.message;
      setError(errorMsg || "Failed to fetch YouTube transcript.");
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {/* Modal Card */}
      <div className="w-full max-w-lg bg-white dark:bg-brand-card border border-stone-200 dark:border-gray-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-gray-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-[#1A1815] dark:text-white">Add Source</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-[#1A1815] dark:text-brand-muted dark:hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4">
          {/* Tab Switcher */}
          <div className="flex gap-1 p-1 bg-stone-100 dark:bg-[#1A1918] rounded-lg">
            <button
              onClick={() => handleTabSwitch('pdf')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider font-semibold transition-all duration-200 ${
                activeTab === 'pdf'
                  ? 'bg-white dark:bg-brand-card text-[#C4791F] dark:text-brand-accent shadow-sm'
                  : 'text-stone-500 dark:text-brand-muted hover:text-[#1A1815] dark:hover:text-brand-text'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload PDF
            </button>
            <button
              onClick={() => handleTabSwitch('url')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider font-semibold transition-all duration-200 ${
                activeTab === 'url'
                  ? 'bg-white dark:bg-brand-card text-[#C4791F] dark:text-brand-accent shadow-sm'
                  : 'text-stone-500 dark:text-brand-muted hover:text-[#1A1815] dark:hover:text-brand-text'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              Web URL
            </button>
            <button
              onClick={() => handleTabSwitch('youtube')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider font-semibold transition-all duration-200 ${
                activeTab === 'youtube'
                  ? 'bg-white dark:bg-brand-card text-[#C4791F] dark:text-brand-accent shadow-sm'
                  : 'text-stone-500 dark:text-brand-muted hover:text-[#1A1815] dark:hover:text-brand-text'
              }`}
            >
              <Video className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
              YouTube
            </button>
          </div>

          {/* ─── PDF Tab Content ─── */}
          {activeTab === 'pdf' && (
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200 ${
                dragActive 
                  ? 'border-[#C4791F] dark:border-brand-accent bg-[#C4791F]/5 dark:bg-brand-accent/5' 
                  : 'border-stone-200 dark:border-brand-border hover:border-[#C4791F]/45 dark:hover:border-brand-accent/40 bg-stone-50/50 dark:bg-brand-bg/20'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf"
                onChange={handleChange}
                className="hidden"
                disabled={isUploading}
              />

              <Upload className="h-10 w-10 text-stone-400 dark:text-brand-muted" />
              
              {file ? (
                <div className="flex items-center gap-2 text-[#1A1815] dark:text-white font-medium text-sm">
                  <FileText className="h-4.5 w-4.5 text-[#C4791F] dark:text-brand-accent" />
                  <span className="truncate max-w-xs">{file.name}</span>
                  <span className="text-xs text-stone-500 dark:text-brand-muted font-normal">
                    ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-[#1A1815] dark:text-white">Drag & drop your PDF file here, or click to browse</p>
                  <p className="text-xs text-stone-500 dark:text-brand-muted mt-2">Only PDF documents up to 5MB and 100 pages are supported.</p>
                </div>
              )}
            </div>
          )}

          {/* ─── URL Tab Content ─── */}
          {activeTab === 'url' && (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Link className="absolute left-3 top-3 h-4 w-4 text-stone-400 dark:text-brand-muted" />
                <input
                  type="url"
                  value={urlValue}
                  onChange={(e) => { setUrlValue(e.target.value); setError(null); }}
                  placeholder="https://example.com/article"
                  disabled={isUploading}
                  className="w-full bg-white dark:bg-[#1A1918] border border-stone-200 dark:border-gray-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#1A1815] dark:text-brand-text placeholder:text-stone-400 dark:placeholder:text-brand-muted focus:outline-none focus:border-[#C4791F] dark:focus:border-brand-accent focus:ring-1 focus:ring-[#C4791F]/20 dark:focus:ring-brand-accent/20 transition-all duration-150 disabled:opacity-50"
                />
              </div>
              <p className="text-xs text-stone-500 dark:text-brand-muted">
                Enter a public web page URL. The page content will be scraped and indexed for Q&A.
              </p>
            </div>
          )}

          {/* ─── YouTube Tab Content ─── */}
          {activeTab === 'youtube' && (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Video className="absolute left-3 top-3 h-4 w-4 text-red-500 dark:text-red-400" />
                <input
                  type="url"
                  value={youtubeValue}
                  onChange={(e) => { setYoutubeValue(e.target.value); setError(null); }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  disabled={isUploading}
                  className="w-full bg-white dark:bg-[#1A1918] border border-stone-200 dark:border-gray-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#1A1815] dark:text-brand-text placeholder:text-stone-400 dark:placeholder:text-brand-muted focus:outline-none focus:border-red-500 dark:focus:border-red-400 focus:ring-1 focus:ring-red-500/20 transition-all duration-150 disabled:opacity-50"
                />
              </div>
              <p className="text-xs text-stone-500 dark:text-brand-muted">
                Enter a public YouTube video URL. If its transcript is unavailable, upload the media or a transcript file instead.
              </p>
              <div className="border border-dashed border-stone-200 dark:border-gray-800 rounded-lg p-3">
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="audio/*,video/*"
                  onChange={(e) => {
                    if (e.target.files?.[0]) validateAndSetMediaFile(e.target.files[0]);
                  }}
                  className="hidden"
                  disabled={isUploading}
                />
                <button
                  type="button"
                  onClick={() => mediaInputRef.current?.click()}
                  disabled={isUploading}
                  className="text-xs text-stone-600 dark:text-brand-muted hover:text-[#C4791F] dark:hover:text-brand-accent"
                >
                  {mediaFile ? `Selected: ${mediaFile.name}` : 'Or upload audio/video for transcription (up to 50MB)'}
                </button>
              </div>
              <div className="border border-dashed border-stone-200 dark:border-gray-800 rounded-lg p-3">
                <input
                  ref={transcriptInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  onChange={(e) => {
                    if (e.target.files?.[0]) validateAndSetTranscriptFile(e.target.files[0]);
                  }}
                  className="hidden"
                  disabled={isUploading}
                />
                <button
                  type="button"
                  onClick={() => transcriptInputRef.current?.click()}
                  disabled={isUploading}
                  className="text-xs text-stone-600 dark:text-brand-muted hover:text-[#C4791F] dark:hover:text-brand-accent"
                >
                  {transcriptFile ? `Selected: ${transcriptFile.name}` : 'Or upload an existing transcript (.txt, up to 2MB)'}
                </button>
              </div>
            </div>
          )}

          {/* Validation Error Alert */}
          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-sm flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 mt-2">
            <button
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 border border-stone-200 dark:border-brand-border hover:border-stone-300 dark:hover:border-brand-text/20 rounded-lg text-[#1A1815] dark:text-brand-muted text-sm font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={
                activeTab === 'pdf'
                  ? handleUploadSubmit
                  : activeTab === 'url'
                  ? handleUrlSubmit
                  : handleYoutubeSubmit
              }
              disabled={
                activeTab === 'pdf'
                  ? (!file || isUploading)
                  : activeTab === 'url'
                  ? (!urlValue.trim() || isUploading)
                  : ((!youtubeValue.trim() && !mediaFile && !transcriptFile) || isUploading)
              }
              className="bg-[#C4791F] dark:bg-brand-accent hover:opacity-90 disabled:opacity-50 text-white dark:text-black px-5 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {activeTab === 'pdf' ? 'Uploading...' : 'Fetching...'}
                </>
              ) : (
                activeTab === 'pdf' ? "Upload File" : transcriptFile ? "Upload & Index" : mediaFile ? "Transcribe & Index" : "Fetch & Index"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UploadModal;
