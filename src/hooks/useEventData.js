import { useEffect, useState, useMemo } from 'react';

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

  const {
    eventTypes  = [],
    countries   = [],
    dateRange   = { start: null, end: null },
    impactMin   = 0,
    searchQuery = '',
  } = filters;

  // Fetch on mount
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/events?limit=1000');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setEvents(json.data || []);
        setDataSource(json.source || 'gdelt');
        setFetchedAt(json.fetchedAt || null);
        setError(null);
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
    return events.filter((event) => {
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
  }, [events, eventTypes, countries, dateRange, impactMin, searchQuery]);

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

    return {
      totalEvents:      filteredEvents.length,
      totalSources,
      totalMentions,
      countriesAffected: countriesSet.size,
      avgGoldstein:     Math.round(avgGoldstein * 10) / 10,
      mostActiveActor,
      latestDate,
    };
  }, [filteredEvents]);

  return {
    events,
    filteredEvents,
    availableCountries,
    loading,
    error,
    dataSource,
    fetchedAt,
    stats,
  };
}
