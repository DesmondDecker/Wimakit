/**
 * useRiderLocationPing
 *
 * When a rider has an active delivery (status: rider_assigned | picked_up |
 * in_transit | near_delivery), this hook starts a GPS ping loop that calls
 * deliveryApi.location() every PING_INTERVAL_MS. The loop stops when all
 * active orders are completed/cancelled or when the component unmounts.
 *
 * expo-location is already installed in this project (expo-location ~18.1.6).
 *
 * Usage (call from rider dashboard):
 *   useRiderLocationPing(activeOrderId);   // pass null when no active order
 */
import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { deliveryApi } from '../utils/api';

const PING_INTERVAL_MS = 10_000; // 10 s — frequent enough for live tracking, conservative on battery

const ACTIVE_STATUSES = new Set(['rider_assigned', 'picked_up', 'in_transit', 'near_delivery']);

export function useRiderLocationPing(activeOrderId: string | null | undefined) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!activeOrderId) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    let cancelled = false;

    const ping = async () => {
      if (cancelled) return;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          // Ask for permission once; if denied, bail — don't spam the user.
          const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
          if (newStatus !== 'granted') return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced, // saves battery vs. High
        });
        await deliveryApi.location(activeOrderId, loc.coords.latitude, loc.coords.longitude);
      } catch (_) {
        // Network errors, GPS timeouts — silently ignore; next tick will retry.
      }
    };

    // Immediate first ping so the map shows location right away
    ping();
    intervalRef.current = setInterval(ping, PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeOrderId]);
}

export { ACTIVE_STATUSES };
