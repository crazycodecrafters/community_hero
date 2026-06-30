import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { Icon, LatLng, Map as LeafletMap } from 'leaflet';
import { FunnelSimple, PlusCircle, MapTrifold, X } from 'phosphor-react';
import toast from 'react-hot-toast';
import { getIssues, getHeatmapData } from '../services/issues';
import { Issue, IssueCategory, IssueSeverity, CATEGORY_LABELS, CATEGORY_ICONS, SEVERITY_COLORS } from '../types';
import { NeuCard } from '../components/ui/NeuCard';
import { NeuButton } from '../components/ui/NeuButton';

const MARKER_SIZE = 28;
const CLUSTER_RADIUS = 60;

const severityIcons: Record<IssueSeverity, Icon> = {
  low: new Icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE],
    popupAnchor: [0, -MARKER_SIZE],
    className: 'marker-low',
  }),
  medium: new Icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE],
    popupAnchor: [0, -MARKER_SIZE],
    className: 'marker-medium',
  }),
  high: new Icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE],
    popupAnchor: [0, -MARKER_SIZE],
    className: 'marker-high',
  }),
  critical: new Icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE],
    popupAnchor: [0, -MARKER_SIZE],
    className: 'marker-critical',
  }),
};

interface Cluster {
  center: LatLng;
  issues: Issue[];
  count: number;
}

function computeClusters(issues: Issue[], map: LeafletMap): Cluster[] {
  const clusters: Cluster[] = [];
  const assigned = new Set<string>();

  for (const issue of issues) {
    if (assigned.has(issue.issue_id)) continue;
    const point = map.latLngToLayerPoint(new LatLng(issue.latitude, issue.longitude));
    const group: Issue[] = [issue];
    assigned.add(issue.issue_id);

    for (const other of issues) {
      if (assigned.has(other.issue_id)) continue;
      const otherPoint = map.latLngToLayerPoint(new LatLng(other.latitude, other.longitude));
      if (point.distanceTo(otherPoint) < CLUSTER_RADIUS) {
        group.push(other);
        assigned.add(other.issue_id);
      }
    }

    const avgLat = group.reduce((s, g) => s + g.latitude, 0) / group.length;
    const avgLng = group.reduce((s, g) => s + g.longitude, 0) / group.length;

    clusters.push({
      center: new LatLng(avgLat, avgLng),
      issues: group,
      count: group.length,
    });
  }

  return clusters;
}

function heatmapColor(value: number): string {
  if (value > 0.6) return '#d63031';
  if (value > 0.3) return '#e17055';
  if (value > 0.1) return '#fdcb6e';
  return '#00b894';
}

const categoryOptions: { value: string; label: string }[] = [
  { value: '', label: 'All Categories' },
  ...Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ value: k, label: v })),
];

function MapClickHandler({ onMapClick }: { onMapClick: (latlng: LatLng) => void }) {
  useMapEvents({
    click: (e) => onMapClick(e.latlng),
  });
  return null;
}

function MapBoundsHandler({ issues, onClusters }: { issues: Issue[]; onClusters: (c: Cluster[]) => void }) {
  const map = useMap();

  useEffect(() => {
    const handleMoveEnd = () => onClusters(computeClusters(issues, map));
    map.on('moveend', handleMoveEnd);
    handleMoveEnd();
    return () => { map.off('moveend', handleMoveEnd); };
  }, [issues, map, onClusters]);

  return null;
}

export const MapPage = () => {
  const navigate = useNavigate();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number]>([20.5937, 78.9629]);
  const [clickedLocation, setClickedLocation] = useState<LatLng | null>(null);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
      () => {},
    );
  }, []);

  useEffect(() => {
    getIssues({ limit: 500 })
      .then((res) => setIssues(res.issues))
      .catch(() => toast.error('Failed to load issues'));
  }, []);

  useEffect(() => {
    if (!showHeatmap) return;
    getHeatmapData()
      .then(setHeatmapData)
      .catch(() => toast.error('Failed to load heatmap data'));
  }, [showHeatmap]);

  const filteredIssues = useMemo(() => {
    if (!selectedCategory) return issues;
    return issues.filter((i) => i.issue_type === selectedCategory);
  }, [issues, selectedCategory]);

  const handleClusters = useCallback((c: Cluster[]) => setClusters(c), []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative h-[calc(100vh-4rem)]"
    >
      <MapContainer
        center={userLocation}
        zoom={13}
        className="h-full w-full z-0"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onMapClick={(latlng) => setClickedLocation(latlng)} />
        <MapBoundsHandler issues={filteredIssues} onClusters={handleClusters} />

        {clusters.map((cluster, idx) =>
          cluster.count === 1 ? (
            <Marker
              key={cluster.issues[0].issue_id}
              position={cluster.center}
              icon={severityIcons[cluster.issues[0].severity]}
            >
              <Popup>
                <div className="min-w-[180px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span>{CATEGORY_ICONS[cluster.issues[0].issue_type]}</span>
                    <span className="font-semibold text-sm">{cluster.issues[0].title}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neu-500 mb-2">
                    <span>{CATEGORY_LABELS[cluster.issues[0].issue_type]}</span>
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ backgroundColor: SEVERITY_COLORS[cluster.issues[0].severity] }}
                    />
                    <span className="capitalize">{cluster.issues[0].severity}</span>
                  </div>
                  <button
                    onClick={() => navigate(`/issues/${cluster.issues[0].issue_id}`)}
                    className="text-xs font-semibold text-primary-DEFAULT hover:underline"
                  >
                    View Details →
                  </button>
                </div>
              </Popup>
            </Marker>
          ) : (
            <Marker
              key={`cluster-${idx}`}
              position={cluster.center}
              icon={new Icon({
                iconUrl: '',
                iconSize: [40, 40],
                iconAnchor: [20, 20],
                className: 'cluster-marker',
              })}
            >
              <Popup>
                <div className="min-w-[160px]">
                  <p className="font-semibold text-sm mb-1">{cluster.count} issues</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {cluster.issues.map((iss) => (
                      <div key={iss.issue_id} className="text-xs flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full inline-flex shrink-0" style={{ backgroundColor: SEVERITY_COLORS[iss.severity] }} />
                        <button
                          onClick={() => navigate(`/issues/${iss.issue_id}`)}
                          className="hover:underline truncate"
                        >
                          {iss.title}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </Popup>
            </Marker>
          ),
        )}

        {showHeatmap &&
          heatmapData.map((point: any, idx: number) => (
            <Marker
              key={`heat-${idx}`}
              position={[point.latitude, point.longitude]}
              icon={new Icon({
                iconUrl: '',
                iconSize: [20, 20],
                iconAnchor: [10, 10],
                className: '',
                html: `<div style="width:20px;height:20px;border-radius:50%;background:${heatmapColor(point.density || 0)};opacity:0.5" />`,
              })}
            />
          ))}
      </MapContainer>

      <div className="absolute top-4 left-4 right-4 z-[1000] flex flex-col gap-2">
        <div className="bg-white/90 backdrop-blur-md rounded-neup shadow-lg p-2 flex items-center gap-2">
          <FunnelSimple size={20} className="text-neu-500 shrink-0" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-transparent text-sm font-medium text-neu-700 outline-none"
          >
            {categoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="absolute top-20 right-4 z-[1000] flex flex-col gap-2">
        <button
          onClick={() => setShowHeatmap((p) => !p)}
          className={`neu-button p-3 rounded-neup shadow-lg ${showHeatmap ? 'text-primary-DEFAULT' : 'text-neu-500'}`}
          title="Toggle heatmap"
        >
          {showHeatmap ? <X size={20} /> : <MapTrifold size={20} />}
        </button>
      </div>

      <div className="absolute bottom-24 left-4 z-[1000]">
        <NeuCard padded={false} className="p-2 text-xs space-y-1.5">
          {(['critical', 'high', 'medium', 'low'] as IssueSeverity[]).map((sev) => (
            <div key={sev} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SEVERITY_COLORS[sev] }} />
              <span className="capitalize text-neu-600">{sev}</span>
            </div>
          ))}
        </NeuCard>
      </div>

      {clickedLocation && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[1000]">
          <NeuButton
            variant="primary"
            icon={<PlusCircle size={18} weight="fill" />}
            onClick={() =>
              navigate(`/report?lat=${clickedLocation.lat}&lng=${clickedLocation.lng}`)
            }
          >
            Report Issue Here
          </NeuButton>
        </div>
      )}
    </motion.div>
  );
};
