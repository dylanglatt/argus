import React, { useRef, useState, useMemo, useEffect } from 'react';
import Map, { Source, Layer, Popup, NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { EVENT_TYPES, MAP_CONFIG } from '../utils/constants';

/**
 * MapView — fills the upper content area.
 * Dark Mapbox basemap, circle markers sized by num_mentions and colored by
 * event type. Events are clustered at low zoom levels. Cluster color reflects
 * conflict density: low count = dim blue, high count = saturated red (heat).
 *
 * Auto-fit: on first event load, the map flies to the bounding box of all
 * loaded events, giving an operationally honest initial view.
 */
export function MapView({ events, onEventClick, selectedEventId, onOpenCountryBrief, showThermal, onConfirm, onDismiss }) {
  const mapRef          = useRef(null);
  const hasFitted       = useRef(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [popupCoords,   setPopupCoords]   = useState(null);
  const [firmsData,     setFirmsData]     = useState(null);
  const mapToken = import.meta.env.VITE_MAPBOX_TOKEN;

  // Fetch FIRMS thermal anomalies when layer is enabled
  useEffect(() => {
    if (!showThermal) return;
    if (firmsData !== null) return; // already fetched (null = not yet fetched; [] = fetched but empty)
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/firms');
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setFirmsData(json.data || []);
      } catch (err) {
        console.warn('[MapView] FIRMS fetch failed:', err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [showThermal, firmsData]);

  // Auto-fit to event bounds on first data load
  useEffect(() => {
    if (hasFitted.current || events.length === 0 || !mapRef.current) return;
    const map = mapRef.current.getMap();
    if (!map) return;

    const validEvents = events.filter((e) => e.latitude && e.longitude);
    if (validEvents.length === 0) return;

    const lngs   = validEvents.map((e) => e.longitude);
    const lats   = validEvents.map((e) => e.latitude);
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
    '#abb3bf',
  ];

  const handleMapClick = (e) => {
    const features = e.features || [];

    // Cluster click → zoom
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

  // Build FIRMS GeoJSON for thermal layer
  const firmsGeoData = useMemo(() => {
    if (!firmsData || firmsData.length === 0) return { type: 'FeatureCollection', features: [] };
    return {
      type: 'FeatureCollection',
      features: firmsData.map((d, i) => ({
        type: 'Feature',
        properties: {
          frp:        d.frp || 0,
          confidence: d.confidence || 0,
          acq_date:   d.acq_date || '',
        },
        geometry: {
          type: 'Point',
          coordinates: [d.longitude, d.latitude],
        },
      })),
    };
  }, [firmsData]);

  // Event type breakdown for legend
  const typeCounts = useMemo(() => {
    const counts = {};
    events.forEach((e) => {
      counts[e.event_type] = (counts[e.event_type] || 0) + 1;
    });
    return counts;
  }, [events]);

  if (!mapToken) {
    return (
      <div style={{
        flex:           1,
        background:     '#111418',
        borderBottom:   '1px solid #2f343c',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#738091', letterSpacing: '0.05em' }}>
            MAP UNAVAILABLE
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: '10px', color: '#5f6b7c', marginTop: '4px' }}>
            Configure VITE_MAPBOX_TOKEN to enable
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', borderBottom: '1px solid #2f343c' }}>
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

        {/*
          Heatmap source — non-clustered, used only for the density background.
          Separate from the marker source so heatmap renders all points as a
          continuous density field, independent of clustering.
        */}
        <Source id="conflict-heatmap" type="geojson" data={geoData}>
          <Layer
            id="conflict-heatmap-layer"
            type="heatmap"
            paint={{
              // Weight by num_mentions so widely-covered events burn brighter
              'heatmap-weight': [
                'interpolate', ['linear'], ['get', 'num_mentions'],
                0, 0.05,
                10, 0.25,
                50, 0.5,
                200, 0.8,
              ],
              // Keep intensity low — this is a background hint, not the primary visual
              'heatmap-intensity': [
                'interpolate', ['linear'], ['zoom'],
                0, 0.2,
                5, 0.5,
              ],
              // Color: transparent → cool blue only — no orange/red bleed at global zoom
              'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0,    'rgba(0,0,0,0)',
                0.2,  'rgba(29,53,87,0.3)',
                0.5,  'rgba(29,78,216,0.45)',
                0.75, 'rgba(120,60,10,0.5)',
                1,    'rgba(180,28,28,0.55)',
              ],
              // Small radius — dots, not continent-spanning blobs
              'heatmap-radius': [
                'interpolate', ['linear'], ['zoom'],
                0, 5,
                3, 8,
                5, 12,
                7, 10,
              ],
              // Fade out early — clusters take over by zoom 4
              'heatmap-opacity': [
                'interpolate', ['linear'], ['zoom'],
                2,  0.35,
                4,  0.2,
                5,  0,
              ],
            }}
          />
        </Source>

        {/* Clustered marker source — clusters + individual points */}
        <Source
          id="conflict-events"
          type="geojson"
          data={geoData}
          cluster={true}
          clusterMaxZoom={6}
          clusterRadius={60}
        >
          {/* Cluster bubble — color by conflict density */}
          <Layer
            id="conflict-clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': [
                'step', ['get', 'point_count'],
                '#1d4ed8',   20,
                '#b45309',   75,
                '#b91c1c',
              ],
              'circle-radius': [
                'step', ['get', 'point_count'],
                16,   20,
                22,   75,
                28,
              ],
              'circle-opacity':        0.95,
              'circle-stroke-width':   1.5,
              'circle-stroke-color': [
                'step', ['get', 'point_count'],
                'rgba(100,140,255,0.55)',  20,
                'rgba(255,160,50,0.55)',   75,
                'rgba(255,80,80,0.55)',
              ],
            }}
          />

          {/* Cluster count label */}
          <Layer
            id="conflict-cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': ['get', 'point_count_abbreviated'],
              'text-font':  ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              'text-size':  11,
            }}
            paint={{ 'text-color': '#f6f7f9' }}
          />

          {/*
            Outer pulse ring on high-impact events (score >= 8).
            Rendered before the fill so it sits behind the main dot.
          */}
          <Layer
            id="conflict-points-pulse"
            type="circle"
            filter={['all', ['!', ['has', 'point_count']], ['>=', ['get', 'impact_score'], 8]]}
            paint={{
              'circle-radius': [
                'interpolate', ['linear'], ['get', 'num_mentions'],
                1, 9, 30, 14, 100, 18, 300, 22,
              ],
              'circle-color':   'transparent',
              'circle-opacity': 1,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': colorExpr,
              'circle-stroke-opacity': [
                'interpolate', ['linear'], ['zoom'],
                4, 0,
                6, 0.6,
              ],
            }}
          />

          {/* Individual unclustered event markers */}
          <Layer
            id="conflict-points"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-radius': radiusExpr,
              'circle-color':  colorExpr,
              // Fade in as zoom increases — heatmap handles the low-zoom view
              'circle-opacity': [
                'interpolate', ['linear'], ['zoom'],
                3, 0,
                5, 0.75,
                7, 0.92,
              ],
              'circle-stroke-width':   1.5,
              'circle-stroke-color':   '#ffffff',
              'circle-stroke-opacity': [
                'interpolate', ['linear'], ['zoom'],
                4, 0,
                6, 0.35,
              ],
            }}
          />
        </Source>

        {/* FIRMS thermal anomaly layer — toggle-able satellite overlay */}
        {showThermal && firmsData && (
          <Source id="firms-thermal" type="geojson" data={firmsGeoData}>
            <Layer
              id="firms-thermal-points"
              type="circle"
              paint={{
                // FRP floor is 30 MW (enforced server-side) so range starts there.
                // Smaller max radius keeps high-FRP detections from swamping event clusters.
                'circle-radius': [
                  'interpolate', ['linear'], ['get', 'frp'],
                  30,  3,
                  100, 5,
                  300, 7,
                  600, 9,
                ],
                'circle-color': [
                  'interpolate', ['linear'], ['get', 'frp'],
                  30,  '#ec9a3c',   // orange — moderate fire
                  150, '#e76a6e',   // red    — high-intensity fire
                ],
                // Lower opacity so event cluster circles remain legible underneath
                'circle-opacity': [
                  'interpolate', ['linear'], ['get', 'frp'],
                  30,  0.25,
                  300, 0.45,
                ],
                'circle-stroke-width': 0,
                'circle-blur': 0.4,
              }}
            />
          </Source>
        )}

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
            <PopupContent
              event={selectedEvent}
              onOpenCountryBrief={onOpenCountryBrief}
              onConfirm={onConfirm}
              onDismiss={onDismiss}
              onClose={() => { setSelectedEvent(null); setPopupCoords(null); }}
            />
          </Popup>
        )}
      </Map>

      {/* Top-left: Theater label + data source badge */}
      <div style={{
        position: 'absolute', top: '12px', left: '12px', zIndex: 400,
        display: 'flex', flexDirection: 'column', gap: '6px',
      }}>
        <div style={{
          background:     'rgba(17, 20, 24, 0.92)',
          border:         '1px solid #2f343c',
          padding:        '5px 12px',
          backdropFilter: 'blur(6px)',
          display:        'flex',
          alignItems:     'center',
          gap:            '10px',
        }}>
          <span style={{
            fontFamily:    'Inter, sans-serif',
            fontSize:      '9px',
            fontWeight:    700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color:         '#738091',
          }}>
            THEATER OVERVIEW
          </span>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize:   '11px',
            color:      '#f6f7f9',
            fontWeight: 600,
          }}>
            {events.length.toLocaleString()} events
          </span>
        </div>

        {/* GDELT badge */}
        <div style={{
          background:     'rgba(17, 20, 24, 0.92)',
          border:         '1px solid #383e47',
          padding:        '3px 10px',
          backdropFilter: 'blur(6px)',
          display:        'flex',
          alignItems:     'center',
          gap:            '6px',
        }}>
          <div style={{
            width:      '5px',
            height:     '5px',
            borderRadius: '50%',
            background: '#32a467',
            flexShrink: 0,
            boxShadow:  '0 0 5px #32a467',
          }} />
          <span style={{
            fontFamily:    'Inter, sans-serif',
            fontSize:      '9px',
            fontWeight:    500,
            color:         '#738091',
            letterSpacing: '0.05em',
          }}>
            GDELT · 15 MIN REFRESH
          </span>
        </div>
      </div>

      {/* Bottom-right: event type breakdown mini-legend */}
      <div style={{
        position:       'absolute',
        bottom:         '28px',
        right:          '12px',
        zIndex:         400,
        background:     'rgba(17, 20, 24, 0.92)',
        border:         '1px solid #2f343c',
        padding:        '8px 10px',
        backdropFilter: 'blur(6px)',
        minWidth:       '140px',
      }}>
        <div style={{
          fontFamily:    'Inter, sans-serif',
          fontSize:      '9px',
          fontWeight:    700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color:         '#738091',
          marginBottom:  '7px',
        }}>
          EVENT TYPES
        </div>
        {Object.entries(EVENT_TYPES).map(([key, type]) => {
          const count = typeCounts[key] || 0;
          if (count === 0) return null;
          return (
            <div key={key} style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              gap:            '8px',
              marginBottom:   '3px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{
                  width:      '5px',
                  height:     '5px',
                  background: type.color,
                  transform:  'rotate(45deg)',
                  flexShrink: 0,
                }} />
                <span style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize:   '9px',
                  color:      '#738091',
                  whiteSpace: 'nowrap',
                }}>
                  {type.label.split('/')[0].trim()}
                </span>
              </div>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize:   '9px',
                color:      '#738091',
              }}>
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PopupContent({ event, onOpenCountryBrief, onConfirm, onDismiss, onClose }) {
  const [feedback, setFeedback] = React.useState(null);
  React.useEffect(() => { setFeedback(null); }, [event.id]);
  const eventType = EVENT_TYPES[event.type];
  const score     = event.impact_score ?? 0;
  const impactColor =
    score >= 8 ? '#e76a6e' :
    score >= 5 ? '#fbb360' :
                 '#738091';

  const tone     = event.avg_tone ?? 0;
  const toneColor = tone < -5 ? '#e76a6e' : tone < 0 ? '#fbb360' : '#32a467';
  const toneStr   = `${tone > 0 ? '+' : ''}${tone.toFixed(1)}`;

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', padding: '10px 12px', minWidth: '240px' }}>
      {/* Type badge */}
      <div style={{
        fontSize:      '9px',
        fontWeight:    700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color:         eventType?.color || '#abb3bf',
        marginBottom:  '4px',
        display:       'flex',
        alignItems:    'center',
        gap:           '5px',
      }}>
        <div style={{
          width:      '5px',
          height:     '5px',
          background: eventType?.color || '#abb3bf',
          transform:  'rotate(45deg)',
          flexShrink: 0,
        }} />
        {event.sub_type || event.type}
      </div>

      {/* Location */}
      <div style={{
        fontSize:     '13px',
        fontWeight:   600,
        color:        '#f6f7f9',
        marginBottom: '10px',
        lineHeight:   1.3,
      }}>
        {event.location}
      </div>

      {/* Details grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
        <Detail label="DATE"       value={event.date}                              mono />
        <Detail label="IMPACT"     value={`${score}/10`} mono valueColor={impactColor} />
        <Detail label="ACTOR 1"    value={event.actor1} />
        <Detail label="ACTOR 2"    value={event.actor2 || '—'} />
        <Detail label="MENTIONS"   value={(event.num_mentions ?? 0).toLocaleString()} mono />
        <Detail label="AVG TONE"   value={toneStr}       mono valueColor={toneColor} />
      </div>

      {/* Notes */}
      {event.notes && (
        <div style={{ borderTop: '1px solid #2f343c', paddingTop: '6px', marginBottom: '6px' }}>
          <div style={{
            fontSize:      '9px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color:         '#738091',
            marginBottom:  '3px',
          }}>
            NOTES
          </div>
          <div style={{
            fontSize:            '10px',
            color:               '#abb3bf',
            lineHeight:          '1.5',
            display:             '-webkit-box',
            WebkitLineClamp:     3,
            WebkitBoxOrient:     'vertical',
            overflow:            'hidden',
          }}>
            {event.notes}
          </div>
        </div>
      )}

      {/* Analyst feedback */}
      <div style={{ borderTop: '1px solid #2f343c', paddingTop: '6px', marginBottom: '6px' }}>
        {feedback ? (
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '6px',
            padding:      '5px 8px',
            background:   feedback === 'confirmed' ? '#32a4670d' : '#e76a6e0d',
            border:       `1px solid ${feedback === 'confirmed' ? '#32a46725' : '#e76a6e25'}`,
            borderLeft:   `3px solid ${feedback === 'confirmed' ? '#32a467' : '#e76a6e'}`,
            borderRadius: '2px',
          }}>
            <span style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              fontWeight:    600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color:         feedback === 'confirmed' ? '#32a467' : '#e76a6e',
            }}>
              {feedback === 'confirmed' ? '✓ CONFIRMED' : '✕ MARKED AS NOISE'}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => {
                setFeedback('confirmed');
                onConfirm?.(event.id);
              }}
              style={{
                flex:          1,
                display:       'flex',
                alignItems:    'center',
                justifyContent:'center',
                gap:           '4px',
                padding:       '4px 6px',
                background:    '#32a4670d',
                border:        '1px solid #32a46730',
                borderRadius:  '2px',
                cursor:        'pointer',
                fontFamily:    'Inter, sans-serif',
                fontSize:      '9px',
                fontWeight:    600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color:         '#32a467',
                transition:    'all 0.12s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background  = '#32a46720';
                e.currentTarget.style.borderColor = '#32a46750';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background  = '#32a4670d';
                e.currentTarget.style.borderColor = '#32a46730';
              }}
            >
              <span>✓</span> CONFIRM VALID
            </button>
            <button
              onClick={() => {
                setFeedback('noise');
                onDismiss?.(event.id);
                setTimeout(() => onClose?.(), 500);
              }}
              style={{
                flex:          1,
                display:       'flex',
                alignItems:    'center',
                justifyContent:'center',
                gap:           '4px',
                padding:       '4px 6px',
                background:    '#e76a6e0d',
                border:        '1px solid #e76a6e30',
                borderRadius:  '2px',
                cursor:        'pointer',
                fontFamily:    'Inter, sans-serif',
                fontSize:      '9px',
                fontWeight:    600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color:         '#e76a6e',
                transition:    'all 0.12s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background  = '#e76a6e20';
                e.currentTarget.style.borderColor = '#e76a6e50';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background  = '#e76a6e0d';
                e.currentTarget.style.borderColor = '#e76a6e30';
              }}
            >
              <span>✕</span> MARK AS NOISE
            </button>
          </div>
        )}
      </div>

      {/* Footer: source link + country brief */}
      <div style={{ borderTop: '1px solid #2f343c', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {event.source_url ? (
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily:     'Inter, sans-serif',
              fontSize:       '9px',
              textTransform:  'uppercase',
              letterSpacing:  '0.05em',
              color:          '#4c90f0',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => (e.target.style.textDecoration = 'underline')}
            onMouseLeave={(e) => (e.target.style.textDecoration = 'none')}
          >
            PRIMARY SOURCE →
          </a>
        ) : <span />}
        {onOpenCountryBrief && event.location && (
          <button
            onClick={() => {
              // Extract country from location string (last segment after comma, or full string)
              const parts   = String(event.location).split(',');
              const country = parts[parts.length - 1].trim();
              onOpenCountryBrief(country);
            }}
            style={{
              background:    'transparent',
              border:        '1px solid #2f343c',
              padding:       '2px 7px',
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              fontWeight:    700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color:         '#738091',
              cursor:        'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#f6f7f9'; e.currentTarget.style.borderColor = '#3a3a50'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#738091'; e.currentTarget.style.borderColor = '#2f343c'; }}
          >
            COUNTRY BRIEF
          </button>
        )}
      </div>
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
        color:         '#738091',
        marginBottom:  '1px',
      }}>
        {label}
      </div>
      <div style={{
        fontSize:     '11px',
        fontFamily:   mono ? 'JetBrains Mono, monospace' : 'Inter, sans-serif',
        color:        valueColor || '#abb3bf',
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
