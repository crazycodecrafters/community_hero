import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { NeuCard, NeuButton, NeuBadge } from '../components/ui';
import { XpPop } from '../components/ui/XpPop';
import { createIssue, classifyIssue } from '../services/issues';
import { useStore } from '../store';
import { CATEGORY_LABELS, SEVERITY_COLORS, AIResult, IssueCategory, IssueSeverity } from '../types';
import { Camera, Trash, MapPin, Sparkle, Check, ArrowLeft, EyeSlash } from 'phosphor-react';

const DEFAULT_ZOOM = 15;

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface DraggableMarkerProps {
  position: [number, number];
  onMove: (lat: number, lng: number) => void;
}

function DraggableMarker({ position, onMove }: DraggableMarkerProps) {
  const markerRef = useRef<L.Marker>(null);
  const eventHandlers = useMemo(() => ({
    dragend() {
      const marker = markerRef.current;
      if (marker) {
        const latlng = marker.getLatLng();
        onMove(latlng.lat, latlng.lng);
      }
    },
  }), [onMove]);

  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });

  return (
    <Marker
      draggable
      eventHandlers={eventHandlers}
      position={position}
      ref={markerRef}
      icon={markerIcon}
    />
  );
}

const severityOptions: IssueSeverity[] = ['low', 'medium', 'high', 'critical'];

export const ReportIssuePage: React.FC = () => {
  const navigate = useNavigate();
  const { addXp, setSubmitting: setStoreSubmitting, addIssue } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isClassifying, setIsClassifying] = useState(false);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [acceptedCategory, setAcceptedCategory] = useState<IssueCategory | null>(null);
  const [manualCategory, setManualCategory] = useState<IssueCategory | null>(null);
  const [manualSeverity, setManualSeverity] = useState<IssueSeverity | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showXpPop, setShowXpPop] = useState(false);
  const [xpPoints, setXpPoints] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation([pos.coords.latitude, pos.coords.longitude]);
        setLocationError(null);
      },
      (err) => {
        setLocationError(`Unable to get location: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handleCapture = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      setImageBase64(result.split(',')[1]);
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleDeleteImage = useCallback(() => {
    setImagePreview(null);
    setImageBase64(null);
    setAiResult(null);
    setAcceptedCategory(null);
  }, []);

  const handleClassify = useCallback(async () => {
    if (!imageBase64 || !description.trim()) return;
    setIsClassifying(true);
    setError(null);
    try {
      const result = await classifyIssue([imageBase64], description.trim());
      setAiResult(result);
      setAcceptedCategory(result.issue_type);
      setManualCategory(null);
      setManualSeverity(null);
    } catch (err) {
      setError('AI classification failed. Please try again.');
    } finally {
      setIsClassifying(false);
    }
  }, [imageBase64, description]);

  const handleMapMove = useCallback((lat: number, lng: number) => {
    setLocation([lat, lng]);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!location) {
      setError('Location is required');
      return;
    }

    const finalCategory = acceptedCategory || manualCategory;
    if (!finalCategory) {
      setError('Please select an issue category');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setStoreSubmitting(true);

    try {
      const payload: {
        title?: string;
        description?: string;
        latitude: number;
        longitude: number;
        is_anonymous?: boolean;
        base64_images?: string[];
      } = {
        latitude: location[0],
        longitude: location[1],
        is_anonymous: isAnonymous,
        base64_images: imageBase64 ? [imageBase64] : undefined,
      };

      if (title.trim()) payload.title = title.trim();
      if (description.trim()) payload.description = description.trim();

      const issue = await createIssue(payload);
      addIssue(issue);

      const earned = 20;
      addXp(earned);
      setXpPoints(earned);
      setShowXpPop(true);

      setTimeout(() => {
        navigate(`/issues/${issue.issue_id}`);
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit issue');
    } finally {
      setIsSubmitting(false);
      setStoreSubmitting(false);
    }
  }, [location, acceptedCategory, manualCategory, manualSeverity, aiResult, imageBase64, title, description, isAnonymous, navigate, addXp, addIssue, setStoreSubmitting]);

  const canClassify = imageBase64 && description.trim().length > 0 && !isClassifying && !aiResult;
  const canSubmit = location && (acceptedCategory || manualCategory) && !isSubmitting;

  return (
    <div className="min-h-screen bg-neu-50 pb-24">
      <div className="sticky top-0 z-40 bg-neu-50/90 backdrop-blur-lg border-b border-neu-200/50 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="neu-icon-button p-2">
          <ArrowLeft size={22} className="text-neu-600" />
        </button>
        <h1 className="text-lg font-bold text-neu-800">Report Issue</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-5">
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-red-500 text-sm bg-red-50/50 rounded-neup px-4 py-2 text-center"
          >
            {error}
          </motion.p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        <NeuCard className="text-center">
          {imagePreview ? (
            <div className="relative">
              <img
                src={imagePreview}
                alt="Issue preview"
                className="w-full h-56 object-cover rounded-neup"
              />
              <button
                onClick={handleDeleteImage}
                className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full shadow-lg hover:bg-red-600 transition-colors"
              >
                <Trash size={18} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleCapture}
              className="w-full h-44 flex flex-col items-center justify-center gap-3 neu-card rounded-neup cursor-pointer hover:scale-[1.01] transition-transform"
            >
              <div className="w-16 h-16 rounded-full bg-primary-DEFAULT/10 flex items-center justify-center">
                <Camera size={32} className="text-primary-DEFAULT" />
              </div>
              <span className="text-neu-500 font-medium text-sm">Tap to capture photo</span>
            </button>
          )}
        </NeuCard>

        <NeuCard>
          <div className="flex items-center gap-2 mb-2">
            <MapPin size={18} className="text-primary-DEFAULT" />
            <span className="text-sm font-semibold text-neu-700">Location</span>
          </div>
          {location ? (
            <p className="text-xs text-neu-500 font-mono">
              {location[0].toFixed(6)}, {location[1].toFixed(6)}
            </p>
          ) : locationError ? (
            <p className="text-xs text-amber-600">{locationError}</p>
          ) : (
            <div className="flex items-center gap-2 text-xs text-neu-400">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Acquiring GPS...
            </div>
          )}
        </NeuCard>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neu-600 mb-2">Title (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's the issue?"
              className="neu-input w-full px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neu-600 mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you see..."
              rows={3}
              className="neu-input w-full px-4 py-3 text-sm resize-none"
            />
          </div>
        </div>

        {canClassify && (
          <NeuButton
            onClick={handleClassify}
            variant="primary"
            className="w-full"
            icon={<Sparkle size={20} weight="fill" />}
          >
            Classify with AI
          </NeuButton>
        )}

        {isClassifying && (
          <NeuCard className="text-center">
            <div className="flex items-center justify-center gap-2 text-primary-DEFAULT">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              <span className="text-sm font-medium">AI is analyzing...</span>
            </div>
          </NeuCard>
        )}

        <AnimatePresence>
          {aiResult && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="space-y-4"
            >
              <NeuCard>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkle size={18} className="text-primary-DEFAULT" weight="fill" />
                  <span className="text-sm font-bold text-neu-700">AI Classification</span>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  <NeuBadge variant="primary">
                    {CATEGORY_LABELS[aiResult.issue_type]}
                  </NeuBadge>
                  <NeuBadge
                    variant={
                      aiResult.severity === 'critical' || aiResult.severity === 'high'
                        ? 'danger'
                        : aiResult.severity === 'medium'
                        ? 'warning'
                        : 'success'
                    }
                  >
                    {aiResult.severity.toUpperCase()}
                  </NeuBadge>
                  <NeuBadge variant="default">{aiResult.department}</NeuBadge>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs text-neu-500 mb-1">
                    <span>Confidence</span>
                    <span>{Math.round(aiResult.confidence * 100)}%</span>
                  </div>
                  <div className="w-full h-2 bg-neu-200 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round(aiResult.confidence * 100)}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="h-full bg-gradient-to-r from-primary-DEFAULT to-primary-dark rounded-full"
                    />
                  </div>
                </div>

                {aiResult.summary && (
                  <p className="text-xs text-neu-500 bg-neu-100/50 rounded-neup_sm px-3 py-2">
                    {aiResult.summary}
                  </p>
                )}

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setAiResult(null); setAcceptedCategory(null); }}
                  className="mt-3 text-xs text-neu-400 hover:text-red-500 transition-colors"
                >
                  Reject &amp; choose manually
                </motion.button>
              </NeuCard>
            </motion.div>
          )}
        </AnimatePresence>

        {!aiResult && (
          <NeuCard>
            <label className="block text-sm font-medium text-neu-600 mb-3">Category</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CATEGORY_LABELS) as IssueCategory[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setManualCategory(manualCategory === cat ? null : cat)}
                  className={`px-3 py-1.5 rounded-neup_sm text-xs font-medium transition-all ${
                    manualCategory === cat
                      ? 'neu-button-primary text-white shadow-md'
                      : 'neu-card text-neu-600 hover:shadow-inner'
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </NeuCard>
        )}

        {!aiResult && (
          <NeuCard>
            <label className="block text-sm font-medium text-neu-600 mb-3">Severity</label>
            <div className="flex gap-2">
              {severityOptions.map((sev) => (
                <button
                  key={sev}
                  onClick={() => setManualSeverity(manualSeverity === sev ? null : sev)}
                  className={`flex-1 px-3 py-2 rounded-neup_sm text-xs font-semibold capitalize transition-all ${
                    manualSeverity === sev
                      ? 'text-white shadow-md'
                      : 'neu-card text-neu-600'
                  }`}
                  style={
                    manualSeverity === sev
                      ? { backgroundColor: SEVERITY_COLORS[sev] }
                      : { borderLeft: `3px solid ${SEVERITY_COLORS[sev]}` }
                  }
                >
                  {sev}
                </button>
              ))}
            </div>
          </NeuCard>
        )}

        {manualCategory && (
          <NeuCard className="bg-emerald-50/30 border border-emerald-200/50">
            <div className="flex items-center gap-2 text-emerald-700 text-xs">
              <Check size={14} weight="bold" />
              Category selected: {CATEGORY_LABELS[manualCategory]}
            </div>
          </NeuCard>
        )}

        {aiResult?.duplicate_candidates && aiResult.duplicate_candidates.length > 0 && (
          <NeuCard className="border-l-4 border-amber-400">
            <div className="flex items-start gap-2">
              <span className="text-amber-500 text-sm">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-amber-700">Possible duplicate</p>
                <p className="text-xs text-neu-500 mt-1">
                  {aiResult.duplicate_candidates.length} similar issue{aiResult.duplicate_candidates.length > 1 ? 's' : ''} nearby.
                  Please check before submitting.
                </p>
              </div>
            </div>
          </NeuCard>
        )}

        <div className="h-56 rounded-neup overflow-hidden neu-card">
          {location ? (
            <MapContainer
              center={location}
              zoom={DEFAULT_ZOOM}
              className="h-full w-full"
              zoomControl={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <DraggableMarker position={location} onMove={handleMapMove} />
            </MapContainer>
          ) : (
            <div className="h-full w-full flex items-center justify-center text-neu-400 text-sm">
              <MapPin size={24} />
              <span className="ml-2">Waiting for location...</span>
            </div>
          )}
        </div>

        <NeuCard>
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <EyeSlash size={18} className="text-neu-400" />
              <span className="text-sm font-medium text-neu-700">Submit anonymously</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isAnonymous}
              onClick={() => setIsAnonymous(!isAnonymous)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                isAnonymous ? 'bg-primary-DEFAULT' : 'bg-neu-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${
                  isAnonymous ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
        </NeuCard>

        <NeuButton
          onClick={handleSubmit}
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!canSubmit}
          loading={isSubmitting}
          icon={<MapPin size={20} weight="fill" />}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Report'}
        </NeuButton>
      </div>

      <XpPop points={xpPoints} trigger={showXpPop} />
    </div>
  );
};
