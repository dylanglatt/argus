import React, { useRef, useState, useMemo, useEffect } from 'react';
import Map, { Source, Layer, Popup, NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { EVENT_TYPES, MAP_CONFIG } from '../utils/constants';

/**
 * MapView — fills the upper content area.
 * Dark Mapbox basemap, circle markers sized by num_mentions and colored by
 * event type. Events are clustered at low zoom levels to clean up dense
 * areas (Middle East, Sahel). Click clusters to zoom in; click individual
 * markers for detail popup.
 *
 * Auto-fit: on first event load, the map flies to the bounding box of all
 * loaded events, giving an operationally honest initial view rather than a
 * static default center.
 */
export function MapView({ events, onEventClick }) {
  const mapRef            = useRef(null);
  const hasFitted         = useRef(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [popupCoords,   setPopupCoords]   = useState(null);
  const mapToken = import.meta.env.VITE_MAPBOX_TOKEN;

  // Auto-fit to event bounds on first data load
  useEffect(() => {
    if (hasFitted.current || events.length === 0 || !mapRef.current) return;
    const map = mapRef.current.getMap();
    if (!map) return;

    const validEvents = events.filter((e) => e.latitude && e.longitude);
    if (validEvents.length === 0) return;

    const lngs = validEvents.map((e) => e.longitude);
    const lats  = validEvents.map((e) => e.latitude);
    const bounds = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];

    map.fitBounds(bounds, { padding: 60, duration: 1200, maxZoom: 6 });
    hasFitted.current = true;
  }, [events]);

  // Build GeoJSON from events
  const geoData = useMemo(() => ({
    type: 'FeatureCollection',
    features: events
      .filter((e) => e.latitude && e.longitude)
      .map((event) => ({
        type: 'Feature',
        properties: {
          id:           event.event_id_cnty,
          date:         event.event_date,
          type:         event.event_type,
          sub_type:     event.sub_event_type,
          location:     event.location,
          actor1:       event.actor1,
          actor2:       event.actor2,
          impact_score: event.impact_score  ?? 0,
          goldstein:    event.goldstein_scale ?? 0,
          num_mentions: event.num_mentions  ?? 1,
          num_sources:  event.num_sources   ?? 1,
          avg_tone:     event.avg_tone      ?? 0,
          source_url:   event.source_url    || '',
          notes:        event.notes         || '',
        },
        geometry: {
          type:        'Point',
          coordinates: [event.longitude, event.latitude],
        },
      })),
  }), [events]);

  // Radius: interpolate 4–14px based on num_mentions (media coverage weight)
  const radiusExpr = [
    'interpolate', ['linear'], ['get', 'num_mentions'],
    1,   4,
    30,  7,
    100, 11,
    300, 14,
  ];

  // Color: match event_type key
  const colorExpr = [
    'match', ['get', 'type'],
    ...Object.entries(EVENT_TYPES).flatMap(([key, t]) => [key, t.color]),
    '#9ca3af',
  ];

  const handleMapClick = (e) => {
    const features = e.features || [];

    // Cluster click → zoom to cluster expansion
    const cluster = features.find((f) => f.layer?.id === 'conflict-clusters');
    if (cluster) {
      const map       = mapRef.current?.getMap();
      const source    = map?.getSource('conflict-events');
      const clusterId = cluster.properties.cluster_id;
      if (source && clusterId != null) {
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({ center: cluster.geometry.coordinates, zoom: zoom + 0.5, duration: 500 });
        });
      }
      return;
    }

    // Individual point click
    const hit = features.find((f) => f.layer?.id === 'conflict-points');
    if (hit) {
      setSelectedEvent(hit.properties);
      setPopupCoords({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      onEventClick?.(hit.properties);
    } else {
      setSelectedEvent(null);
      setPopupCoords(null);
    }
  };

  if (!mapToken) {
    return (
      <div style={{
        flex:           1,
        background:     '#0a0a0f',
        borderBottom:   '1px solid #1e1e30',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6b7280', letterSpacing: '0.05em' }}>
            MAP UNAVAILABLE
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: '10px', color: '#4a4a5a', marginTop: '4px' }}>
            Configure VITE_MAPBOX_TOKEN to enable
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', borderBottom: '1px solid #1e1e30' }}>
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: MAP_CONFIG.center[0],
          latitude:  MAP_CONFIG.center[1],
          zoom:      MAP_CONFIG.zoom,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_CONFIG.style}
        mapboxAccessToken={mapToken}
        interactiveLayerIds={['conflict-clusters', 'conflict-points']}
        onClick={handleMapClick}
        cursor="crosshair"
        attributionControl={false}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {/* Clustering source — events within ~50px of each other merge at zoom < 5 */}
        <Source
          id="conflict-events"
          type="geojson"
          data={geoData}
          cluster={true}
          clusterMaxZoom={5}
          clusterRadius={50}
        >
          {/* Cluster bubble */}
          <Layer
            id="conflict-clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': [
                'step', ['get', 'point_count'],
                '#1e3a5f',   10,
                '#1d4ed8',   30,
                '#7c3aed',
              ],
              'circle-radius': [
                'step', ['get', 'point_count'],
                14,   10,
                18,   30,
                22,
              ],
              'circle-opacity':        0.85,
              'circle-stroke-width':   1,
              'circle-stroke-color':   'rgba(255,255,255,0.15)',
            }}
          />

          {/* Cluster count label */}
          <Layer
            id="conflict-cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field':  ['get', 'point_count_abbreviated'],
              'text-font':   ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              'text-size':   10,
            }}
            paint={{
              'text-color': '#e2e4e9',
            }}
          />

          {/* Individual unclustered points */}
          <Layer
            id="conflict-points"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-radius':         radiusExpr,
              'circle-color':          colorExpr,
              'circle-opacity':        0.85,
              'circle-stroke-width':   0.5,
              'circle-stroke-color':   '#ffffff',
              'circle-stroke-opacity': 0.25,
            }}
          />
        </Source>

        {selectedEvent && popupCoords && (
          <Popup
            longitude={popupCoords.lng}
            latitude={popupCoords.lat}
            onClose={() => { setSelectedEvent(null); setPopupCoords(null); }}
            closeButton={true}
            closeOnClick={false}
            maxWidth="300px"
            anchor="bottom"
            offset={12}
          >
            <PopupContent event={selectedEvent} />
          </Popup>
        )}
      </Map>

      {/* Top-left: Theater label + GDELT badge */}
      <div style={{
        position: 'absolute', top: '12px', left: '12px', zIndex: 400,
        display: 'flex', flexDirection: 'column', gap: '6px',
      }}>
        <div style={{
          background: 'rgba(10, 10, 15, 0.88)',
          border: '1px solid #1e1e30',
          padding: '4px 10px',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{
            fontFamily: 'Inter, sans-serif', fontSize: '10px', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280',
          }}>
            THEATER OVERVIEW
          </span>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: '9px',
            color: '#e2e4e9', fontWeight: 500,
          }}>
            {events.length.toLocaleString()} events
          </span>
        </div>

        {/* GDELT update cadence badge */}
        <div style={{
          background: 'rgba(10, 10, 15, 0.88)',
          border: '1px solid #1e1e3088',
          padding: '3px 8px',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', gap: '5px',
        }}>
          <div style={{
            width: '5px', height: '5px', borderRadius: '50%',
            background: '#10b981', flexShrink: 0,
            boxShadow: '0 0 4px #10b981',
          }} />
          <span style={{
            fontFamily: 'Inter, sans-serif', fontSize: '9px',
            color: '#6b7280', letterSpacing: '0.04em',
          }}>
            GDELT · 15 MIN REFRESH
          </span>
        </div>
      </div>

      {/* Bottom-right: coverage scale legend (moved away from Mapbox logo) */}
      <div style={{
        position: 'absolute', bottom: '28px', right: '12px', zIndex: 400,
        background: 'rgba(10, 10, 15, 0.88)',
        border: '1px solid #1e1e30',
        padding: '8px 10px',
        backdropFilter: 'blur(4px)',
      }}>
        <div style={{
          fontFamily: 'Inter, sans-serif', fontSize: '9px', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280',
          marginBottom: '6px',
        }}>
          COVERAGE WEIGHT
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {[
            { r: 4, label: '1' },
            { r: 7, label: '30' },
            { r: 11, label: '100' },
            { r: 14, label: '300+' },
          ].map(({ r, label }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
              <div style={{
                width: r * 2 + 'px', height: r * 2 + 'px', borderRadius: '50%',
                background: 'rgba(180,180,180,0.25)', border: '1px solid rgba(255,255,255,0.15)',
                flexShrink: 0,
              }} />
              <span style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: '8px', color: '#4a4a5a',
              }}>
                {label}
              </span>
            </div>
          ))}
          <span style={{
            fontFamily: 'Inter, sans-serif', fontSize: '9px', color: '#4a4a5a',
            marginLeft: '2px',
          }}>
            mentions
          </span>
        </div>
      </div>
    </div>
  );
}

function PopupContent({ event }) {
  const eventType = EVENT_TYPES[event.type];

  // Impact score color
  const score = event.impact_score ?? 0;
  const impactColor =
    score >= 8 ? '#ef4444' :
    score >= 5 ? '#eab308' :
                 '#6b7280';

  // Tone color: negative = bad, positive = good
  const tone = event.avg_tone ?? 0;
  const toneColor = tone < -5 ? '#ef4444' : tone < 0 ? '#eab308' : '#10b981';
  const toneStr   = `${tone > 0 ? '+' : ''}${tone.toFixed(1)}`;

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', padding: '10px 12px', minWidth: '240px' }}>
      {/* Type badge */}
      <div style={{
        fontSize:      '9px',
        fontWeight:    600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color:         eventType?.color || '#9ca3af',
        marginBottom:  '2px',
        display:       'flex',
        alignItems:    'center',
        gap:           '5px',
      }}>
        <div style={{
          width:      '5px',
          height:     '5px',
          background: eventType?.color || '#9ca3af',
          transform:  'rotate(45deg)',
          flexShrink: 0,
        }} />
        {event.sub_type || event.type}
      </div>

      {/* Location */}
      <div style={{
        fontSize:     '13px',
        fontWeight:   600,
        color:        '#e2e4e9',
        marginBottom: '8px',
      }}>
        {event.location}
      </div>

      {/* Details grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
        <Detail label="DATE"       value={event.date}                               mono />
        <Detail label="IMPACT"     value={`${score}/10`}  mono valueColor={impactColor} />
        <Detail label="ACTOR 1"    value={event.actor1} />
        <Detail label="ACTOR 2"    value={event.actor2 || '—'} />
        <Detail label="MENTIONS"   value={(event.num_mentions ?? 0).toLocaleString()} mono />
        <Detail label="AVG TONE"   value={toneStr}        mono valueColor={toneColor} />
      </div>

      {/* Notes */}
      {event.notes && (
        <div style={{ borderTop: '1px solid #1e1e30', paddingTop: '6px', marginBottom: '6px' }}>
          <div style={{
            fontSize:      '9px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color:         '#6b7280',
            marginBottom:  '2px',
          }}>
            NOTES
          </div>
          <div style={{
            fontSize:            '10px',
            color:               '#9ca3af',
            lineHeight:          '1.4',
            display:             '-webkit-box',
            WebkitLineClamp:     3,
            WebkitBoxOrient:     'vertical',
            overflow:            'hidden',
          }}>
            {event.notes}
          </div>
        </div>
      )}

      {/* Source link */}
      {event.source_url && (
        <div style={{ borderTop: '1px solid #1e1e30', paddingTop: '6px' }}>
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color:         '#3b82f6',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
            onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
          >
            PRIMARY SOURCE →
          </a>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono, valueColor }) {
  return (
    <div>
      <div style={{
        fontSize:      '9px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color:         '#6b7280',
      }}>
        {label}
      </div>
      <div style={{
        fontSize:     '11px',
        fontFamily:   mono ? 'JetBrains Mono, monospace' : 'Inter, sans-serif',
        color:        valueColor || '#9ca3af',
        fontWeight:   mono ? 500 : 400,
        whiteSpace:   'nowrap',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
      }}>
        {value}
      </div>
    </div>
  );
}
