import React, { useState, useEffect, useRef, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, FunnelChart, Funnel, LabelList } from 'recharts';
import { AlertCircle, AlertTriangle, Info, Wifi, WifiOff, RefreshCw } from 'lucide-react';

const API_BASE = "http://localhost:8000";
const STORE_ID = "STORE_BLR_002";

// --- HOOKS ---
function useStoreStream(storeId) {
  const [data, setData] = useState({ metrics: {}, funnel: [], heatmap: [], anomalies: [] });
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING');
  const [lastUpdated, setLastUpdated] = useState(null);
  const reconnectTimeoutRef = useRef(null);
  const eventSourceRef = useRef(null);
  const retryCount = useRef(0);

  const connect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionStatus('CONNECTING');
    const url = `${API_BASE}/stores/${storeId}/stream`;
    const es = new EventSource(url);

    es.onopen = () => {
      setConnectionStatus('LIVE');
      retryCount.current = 0;
    };

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setData({
          metrics: parsed.metrics || {},
          funnel: parsed.funnel || [],
          heatmap: parsed.heatmap || [],
          anomalies: parsed.anomalies || []
        });
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        console.error("Failed to parse SSE payload", err);
      }
    };

    es.onerror = () => {
      es.close();
      setConnectionStatus('DISCONNECTED');
      // Exponential backoff
      const timeout = Math.min(1000 * Math.pow(2, retryCount.current), 30000);
      retryCount.current += 1;
      reconnectTimeoutRef.current = setTimeout(connect, timeout);
    };

    eventSourceRef.current = es;
  };

  useEffect(() => {
    connect();
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [storeId]);

  return { ...data, connectionStatus, lastUpdated };
}

// --- COMPONENTS ---

const ConnectionStatus = ({ status, lastUpdated }) => {
  const statusConfig = {
    LIVE: { color: 'text-green-500', bg: 'bg-green-500/10', icon: Wifi, text: 'LIVE' },
    CONNECTING: { color: 'text-yellow-500', bg: 'bg-yellow-500/10', icon: RefreshCw, text: 'RECONNECTING' },
    DISCONNECTED: { color: 'text-red-500', bg: 'bg-red-500/10', icon: WifiOff, text: 'DISCONNECTED' }
  };
  const { color, bg, icon: Icon, text } = statusConfig[status] || statusConfig.DISCONNECTED;

  return (
    <div className="flex items-center space-x-4 text-sm font-medium">
      <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${bg} ${color}`}>
        <Icon className={`w-4 h-4 ${status === 'CONNECTING' ? 'animate-spin' : ''}`} />
        <span>{text}</span>
      </div>
      <div className="text-gray-400">
        Last updated: {lastUpdated || '--:--:--'}
      </div>
    </div>
  );
};

const MetricCard = ({ title, value, subtitle, trend, severity = 'neutral' }) => {
  const severityColors = {
    neutral: 'text-gray-100',
    warning: 'text-yellow-500',
    critical: 'text-red-500',
    good: 'text-green-500'
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg flex flex-col justify-between">
      <h3 className="text-gray-400 text-sm font-semibold tracking-wider uppercase">{title}</h3>
      <div className="mt-2 flex items-baseline space-x-2">
        <span className={`text-4xl font-bold tracking-tight ${severityColors[severity]}`}>
          {value}
        </span>
      </div>
      {subtitle && (
        <div className="mt-2 text-sm text-gray-500 font-medium">
          {subtitle}
        </div>
      )}
    </div>
  );
};

const ZoneHeatmap = ({ zones }) => {
  if (!zones || zones.length === 0) return <div className="text-gray-500 italic p-4">No heatmap data available.</div>;

  return (
    <div className="h-64 w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={zones} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <XAxis type="number" hide />
          <YAxis dataKey="zone_id" type="category" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af' }} width={90} />
          <Tooltip 
            cursor={{fill: '#374151'}} 
            contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '0.5rem', color: '#f3f4f6' }}
            formatter={(value, name, props) => [`${props.payload.avg_dwell_seconds} sec avg`, 'Dwell Time']}
          />
          <Bar dataKey="normalised_score" radius={[0, 4, 4, 0]} barSize={24}>
            {zones.map((entry, index) => {
              // Color logic: 0-33 Green, 34-66 Yellow, 67-100 Red
              let color = '#10b981'; // green-500
              if (entry.normalised_score > 33) color = '#eab308'; // yellow-500
              if (entry.normalised_score > 66) color = '#ef4444'; // red-500
              return <Cell key={`cell-${index}`} fill={color} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const FunnelVisual = ({ stages }) => {
  if (!stages || stages.length === 0) return <div className="text-gray-500 italic p-4">No funnel data available.</div>;
  
  // Custom Funnel rendering using Recharts FunnelChart
  return (
    <div className="h-64 w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <FunnelChart>
          <Tooltip 
            contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '0.5rem', color: '#f3f4f6' }}
            formatter={(value, name, props) => [
              `${value} visitors (${props.payload.dropoff_pct}% drop-off from prev)`, 
              props.payload.stage
            ]}
          />
          <Funnel
            dataKey="count"
            data={stages}
            isAnimationActive
          >
            <LabelList position="right" fill="#9ca3af" stroke="none" dataKey="stage" />
            {stages.map((entry, index) => (
               <Cell key={`cell-${index}`} fill={['#3b82f6', '#6366f1', '#8b5cf6', '#d946ef'][index % 4]} />
            ))}
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    </div>
  );
};

const AnomalyFeed = ({ anomalies }) => {
  const [visibleAnomalies, setVisibleAnomalies] = useState([]);

  useEffect(() => {
    const now = Date.now();
    // Fade out anomalies older than 5 minutes (300,000 ms)
    const active = anomalies.filter(a => (now - (a.timestamp || now)) < 300000);
    setVisibleAnomalies(active);
  }, [anomalies]);

  if (visibleAnomalies.length === 0) {
    return (
      <div className="flex items-center space-x-2 text-green-500 p-4 bg-green-500/10 rounded-lg">
        <Wifi className="w-5 h-5" />
        <span className="font-medium">No active anomalies. Operations normal.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibleAnomalies.map((anomaly, idx) => {
        const isCritical = anomaly.severity === 'CRITICAL';
        const isWarn = anomaly.severity === 'WARN';
        
        const baseClasses = "flex items-start space-x-3 p-4 rounded-lg border";
        const colorClasses = isCritical 
          ? "bg-red-500/10 border-red-500/20 text-red-400" 
          : isWarn 
            ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
            : "bg-blue-500/10 border-blue-500/20 text-blue-400";
            
        const Icon = isCritical ? AlertTriangle : (isWarn ? AlertCircle : Info);

        return (
          <div key={`${anomaly.type}-${idx}`} className={`${baseClasses} ${colorClasses}`}>
            <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold">{anomaly.type.replace(/_/g, ' ')}</h4>
              <p className="text-sm mt-1 opacity-90">{anomaly.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};


// --- MAIN APP COMPONENT ---
export default function App() {
  const { metrics, funnel, heatmap, anomalies, connectionStatus, lastUpdated } = useStoreStream(STORE_ID);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 font-sans selection:bg-blue-500/30">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-3">
              <span>🏪</span>
              <span>{STORE_ID} — Apex Retail Intelligence</span>
            </h1>
            <p className="text-gray-400 mt-1 text-sm">Real-time store floor analytics & operations</p>
          </div>
          <div className="mt-4 md:mt-0">
            <ConnectionStatus status={connectionStatus} lastUpdated={lastUpdated} />
          </div>
        </header>

        {/* Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard 
            title="Visitors Today" 
            value={metrics.unique_visitors ?? '--'} 
            subtitle="Live count from entry threshold"
            severity={metrics.unique_visitors === 0 ? 'warning' : 'neutral'}
          />
          <MetricCard 
            title="Conversion Rate" 
            value={metrics.conversion_rate !== undefined ? `${metrics.conversion_rate}%` : '--'} 
            subtitle="Purchase / Visitors"
            trend="up"
            severity={metrics.conversion_rate > 20 ? 'good' : 'neutral'}
          />
          <MetricCard 
            title="Queue Depth" 
            value={metrics.queue_depth ?? '--'} 
            subtitle={metrics.queue_depth > 5 ? "⚠ Building rapidly" : "Normal levels"}
            severity={metrics.queue_depth > 5 ? 'critical' : (metrics.queue_depth > 3 ? 'warning' : 'good')}
          />
          <MetricCard 
            title="Abandonment" 
            value={metrics.abandonment_rate !== undefined ? `${metrics.abandonment_rate}%` : '--'} 
            subtitle="Left queue without buying"
            severity={metrics.abandonment_rate > 15 ? 'critical' : 'neutral'}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Heatmap */}
          <section className="bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg">
            <h3 className="text-gray-400 text-sm font-semibold tracking-wider uppercase border-b border-gray-700 pb-3 mb-4">
              Zone Heatmap
            </h3>
            <ZoneHeatmap zones={heatmap} />
          </section>

          {/* Funnel */}
          <section className="bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg">
            <h3 className="text-gray-400 text-sm font-semibold tracking-wider uppercase border-b border-gray-700 pb-3 mb-4">
              Conversion Funnel
            </h3>
            <FunnelVisual stages={funnel} />
          </section>
        </div>

        {/* Anomalies List */}
        <section className="bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg">
           <h3 className="text-gray-400 text-sm font-semibold tracking-wider uppercase border-b border-gray-700 pb-3 mb-4">
            Active Anomalies
          </h3>
          <AnomalyFeed anomalies={anomalies} />
        </section>

      </div>
    </div>
  );
}