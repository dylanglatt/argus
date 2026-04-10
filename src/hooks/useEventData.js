import { useEffect, useState, useMemo, useCallback } from 'react';

/**
 * useEventData
 * ------------
 * Fetches conflict events from the GDELT-backed API and applies
 * client-side filtering. Returns filtered events, computed stats,
 * the full list of available countries, and load/error state.
 *
 * Filter keys:
 *   eventTypes  - array of Sentinel event type strings
 *   countries   - array of country name strings
 *   dateRange   - { start: 'YYYY-MM-DD' | null, end: 'YYYY-MM-DD' | null }
 *   impactMin   - minimum impact_score (0–10, inverted Goldstein)
 *   searchQuery - free-text search against location, actors, notes
 */
export function useEventData(filters = {}) {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [dataSource, setDataSource] = useState('gdelt');
  const [fetchedAt, setFetchedAt]   = useState(null); // Unix ms of last GDELT cache fill
  const [dismissedIds, setDismissedIds] = useState(new Set()); // Analyst-dismissed event IDs

  const {
    eventTypes  = [],
    countries   = [],
    dateRange   = { start: null, end: null },
    impactMin   = 0,
    searchQuery = '',
    timeWindow  = 'ALL', // 'ALL' | '24H' | '48H' | '72H'
  } = filters;

  // Fetch on mount
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/events?limit=1000');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const loadedEvents = json.data || [];
        setEvents(loadedEvents);
        setDataSource(json.source || 'gdelt');
        setFetchedAt(json.fetchedAt || null);
        setDismissedIds(new Set((json.dismissedIds || []).map(String)));
        setError(null);

        // Batch corroboration for eligible events (Explosions/Remote violence, Battles)
        const eligible = loadedEvents.filter(
          (e) => (e.event_type === 'Explosions/Remote violence' || e.event_type === 'Battles')
            && e.latitude && e.longitude && e.event_date
        );
        if (eligible.length > 0) {
          try {
            const batchPayload = eligible.map((e) => ({
              id:   e.event_id_cnty,
              lat:  e.latitude,
              lon:  e.longitude,
              date: e.event_date,
            }));
            const corrRes = await fetch('/api/firms/corroborate-batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ events: batchPayload }),
            });
            if (corrRes.ok) {
              const { results } = await corrRes.json();
              setEvents((prev) => prev.map((e) => {
                const r = results[e.event_id_cnty];
                if (r && r.corroborated) {
                  return { ...e, satellite_corroborated: true, firms_detections: r.detections, firms_max_frp: r.maxFRP, firms_nearest_km: r.nearestKm };
                }
                return e;
              }));
            }
          } catch (corrErr) {
            console.warn('[useEventData] FIRMS corroboration failed:', corrErr.message);
          }
        }
      } catch (err) {
        console.error('[useEventData] fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Derive available countries from the full event set (not hardcoded)
  const availableCountries = useMemo(() => {
    const set = new Set(events.map((e) => e.country).filter(Boolean));
    return [...set].sort();
  }, [events]);

  // Apply filters
  const filteredEvents = useMemo(() => {
    // Rolling time window cutoff date (YYYY-MM-DD)
    let windowCutoff = null;
    if (timeWindow !== 'ALL') {
      const hours = timeWindow === '24H' ? 24 : timeWindow === '48H' ? 48 : 72;
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      windowCutoff = cutoff.toISOString().slice(0, 10);
    }

    return events.filter((event) => {
      // Rolling time window
      if (windowCutoff && event.event_date < windowCutoff) return false;

      // Event type filter
      if (eventTypes.length > 0 && !eventTypes.includes(event.event_type)) {
        return false;
      }

      // Country filter
      if (countries.length > 0 && !countries.includes(event.country)) {
        return false;
      }

      // Date range filter
      if (dateRange.start) {
        if (new Date(event.event_date) < new Date(dateRange.start)) return false;
      }
      if (dateRange.end) {
        if (new Date(event.event_date) > new Date(dateRange.end)) return false;
      }

      // Impact score (min conflict severity)
      if ((event.impact_score ?? 0) < impactMin) {
        return false;
      }

      // Free-text search: location, actors, notes
      if (searchQuery.length > 0) {
        const q = searchQuery.toLowerCase();
        const match =
          (event.location  || '').toLowerCase().includes(q) ||
          (event.actor1    || '').toLowerCase().includes(q) ||
          (event.actor2    || '').toLowerCase().includes(q) ||
          (event.notes     || '').toLowerCase().includes(q) ||
          (event.country   || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [events, eventTypes, countries, dateRange, impactMin, searchQuery, timeWindow]);

  // Compute aggregate stats from filtered set
  const stats = useMemo(() => {
    const countriesSet = new Set(filteredEvents.map((e) => e.country));

    const totalSources = filteredEvents.reduce((sum, e) => sum + (e.num_sources || 0), 0);
    const totalMentions = filteredEvents.reduce((sum, e) => sum + (e.num_mentions || 0), 0);

    // Average Goldstein scale across filtered events (negative = more conflict)
    const avgGoldstein =
      filteredEvents.length > 0
        ? filteredEvents.reduce((sum, e) => sum + (e.goldstein_scale || 0), 0) / filteredEvents.length
        : 0;

    // Most active actor by frequency
    const actorCounts = {};
    filteredEvents.forEach((e) => {
      if (e.actor1 && e.actor1 !== 'Unknown') actorCounts[e.actor1] = (actorCounts[e.actor1] || 0) + 1;
      if (e.actor2 && e.actor2 !== 'Unknown') actorCounts[e.actor2] = (actorCounts[e.actor2] || 0) + 1;
    });
    const mostActiveActor = Object.entries(actorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    // Most recent event date in the filtered set
    const latestDate = filteredEvents.length > 0
      ? filteredEvents.reduce((max, e) => e.event_date > max ? e.event_date : max, '')
      : null;

    // Trend: compare avg Goldstein of recent half vs prior half of the filtered set.
    // A more negative recent average = conflict intensifying = ESCALATING.
    const sortedByDate = [...filteredEvents].sort((a, b) =>
      a.event_date < b.event_date ? -1 : 1
    );
    const mid        = Math.floor(sortedByDate.length / 2);
    const priorHalf  = sortedByDate.slice(0, mid);
    const recentHalf = sortedByDate.slice(mid);
    const halfAvg    = (arr) =>
      arr.length === 0
        ? 0
        : arr.reduce((s, e) => s + (e.goldstein_scale || 0), 0) / arr.length;
    const trendDiff  = halfAvg(recentHalf) - halfAvg(priorHalf);
    const trend      =
      trendDiff < -0.5 ? 'ESCALATING' :
      trendDiff >  0.5 ? 'DE-ESCALATING' :
                         'STABLE';

    return {
      totalEvents:      filteredEvents.length,
      totalSources,
      totalMentions,
      countriesAffected: countriesSet.size,
      avgGoldstein:     Math.round(avgGoldstein * 10) / 10,
      mostActiveActor,
      latestDate,
      trend,
      trendDiff:        Math.round(trendDiff * 10) / 10,
    };
  }, [filteredEvents]);

  // ---------------------------------------------------------------------------
  // Analyst feedback: dismiss an event as noise.
  // Optimistically removes it from local state, then notifies the backend.
  // ---------------------------------------------------------------------------
  const dismissEvent = useCallback(async (eventId) => {
    const id = String(eventId);
    // Optimistic update — remove immediately from UI
    setDismissedIds((prev) => new Set([...prev, id]));
    setEvents((prev) => prev.filter((e) => String(e.event_id_cnty) !== id));

    try {
      await fetch(`/api/events/${id}/dismiss`, { method: 'POST' });
    } catch (err) {
      console.warn('[useEventData] dismiss failed:', err.message);
    }
  }, []);

  return {
    events,
    filteredEvents,
    availableCountries,
    loading,
    error,
    dataSource,
    fetchedAt,
    dismissedIds,
    dismissEvent,
    stats,
  };
}
