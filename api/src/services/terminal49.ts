// Terminal49 container-tracking client (JSON:API). Key is server-side only.
// Docs: https://terminal49.com/docs — base https://api.terminal49.com/v2,
// auth `Authorization: Token <key>`, media type application/vnd.api+json.
//
// Async model: POST a tracking request (by BL / booking / container + SCAC),
// Terminal49 fetches from the carrier over minutes, then pushes webhooks. We read
// shipments/containers/events on demand and stop tracking via PATCH stop_tracking.

const BASE = () => process.env.TERMINAL49_BASE_URL || 'https://api.terminal49.com/v2';
const KEY = () => process.env.TERMINAL49_API_KEY || '';

export const t49Configured = (): boolean => KEY().length > 0;

export class T49Error extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'T49Error';
    this.status = status;
    this.body = body;
  }
}

async function t49<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  if (!t49Configured()) throw new T49Error('terminal49_not_configured', 503);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  let res: Response;
  try {
    res = await fetch(`${BASE()}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Token ${KEY()}`,
        'Content-Type': 'application/vnd.api+json',
        Accept: 'application/vnd.api+json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    throw new T49Error(`terminal49_unreachable: ${(e as Error).message}`, 502);
  }
  clearTimeout(timer);
  const text = await res.text();
  const json = text ? safeJson(text) : null;
  if (!res.ok) throw new T49Error(`terminal49_error_${res.status}`, res.status, json ?? text);
  return json as T;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export type RequestType = 'bill_of_lading' | 'booking_number' | 'container';

export interface TrackingRequestResult {
  id: string;
  status: string; // pending | awaiting_manifest | created | failed ...
  failedReason?: string;
  shipmentId?: string;
}

/** Create a tracking request. Terminal49 processes it asynchronously. */
export async function createTrackingRequest(
  requestType: RequestType,
  requestNumber: string,
  scac: string,
): Promise<TrackingRequestResult> {
  const body = {
    data: {
      type: 'tracking_request',
      attributes: { request_type: requestType, request_number: requestNumber, scac },
    },
  };
  const j = (await t49<JsonApi>('/tracking_requests', { method: 'POST', body })) as JsonApi;
  return parseTrackingRequest(j.data);
}

export async function getTrackingRequest(id: string): Promise<TrackingRequestResult> {
  const j = (await t49<JsonApi>(`/tracking_requests/${id}`)) as JsonApi;
  return parseTrackingRequest(j.data);
}

/** Stop live tracking for a shipment (frees a slot). Idempotent-ish on T49 side. */
export async function stopShipmentTracking(shipmentId: string): Promise<void> {
  await t49(`/shipments/${shipmentId}/stop_tracking`, { method: 'PATCH' });
}

export interface ShipmentSnapshot {
  shipmentId: string;
  blNumber?: string;
  scac?: string;
  shippingLine?: string;
  portOfLading?: string;
  portOfDischarge?: string;
  podEta?: string;
  podArrivedAt?: string;
  vessel?: string;
  status?: string;
  containers: ContainerSnapshot[];
  lastEventAt?: string;
}

export interface ContainerSnapshot {
  containerId: string;
  number?: string;
  sealNumber?: string;
  equipment?: string;
  podDischargedAt?: string;
  availableForPickup?: boolean;
  lastFreeDay?: string;
  emptyReturnedAt?: string;
  lastEvent?: { event?: string; at?: string; location?: string; vessel?: string };
}

/** Fetch a shipment with its containers (uses ?include to fold them in). */
export async function getShipmentSnapshot(shipmentId: string): Promise<ShipmentSnapshot> {
  const j = (await t49<JsonApi>(`/shipments/${shipmentId}?include=containers`)) as JsonApi;
  const a = (j.data?.attributes ?? {}) as Record<string, unknown>;
  const containers = (j.included ?? [])
    .filter((r) => r.type === 'container')
    .map(parseContainer);
  const podEta = str(a.pod_eta_at) ?? str(a.pod_eta) ?? str(a.destination_eta_at);
  return {
    shipmentId,
    blNumber: str(a.bill_of_lading_number),
    scac: str(a.shipping_line_scac),
    shippingLine: str(a.shipping_line_name),
    portOfLading: str(a.port_of_lading_name) ?? str(a.pol_name),
    portOfDischarge: str(a.port_of_discharge_name) ?? str(a.pod_name),
    podEta,
    podArrivedAt: str(a.pod_arrived_at),
    vessel: str(a.pod_vessel_name) ?? str(a.vessel_name),
    status: str(a.status) ?? str(a.pod_status),
    containers,
    lastEventAt: str(a.line_tracking_last_succeeded_at) ?? str(a.updated_at),
  };
}

function parseContainer(r: JsonApiResource): ContainerSnapshot {
  const a = (r.attributes ?? {}) as Record<string, unknown>;
  return {
    containerId: r.id,
    number: str(a.number),
    sealNumber: str(a.seal_number),
    equipment: str(a.equipment_type) ?? str(a.equipment_length),
    podDischargedAt: str(a.pod_discharged_at),
    availableForPickup: typeof a.available_for_pickup === 'boolean' ? (a.available_for_pickup as boolean) : undefined,
    lastFreeDay: str(a.pickup_lfd) ?? str(a.pod_last_free_day_on),
    emptyReturnedAt: str(a.empty_terminated_at) ?? str(a.empty_returned_at),
  };
}

function parseTrackingRequest(d?: JsonApiResource): TrackingRequestResult {
  const a = (d?.attributes ?? {}) as Record<string, unknown>;
  const shipmentId =
    d?.relationships?.tracked_object?.data?.id ??
    d?.relationships?.shipment?.data?.id ??
    str(a.shipment_id);
  return {
    id: d?.id ?? '',
    status: str(a.status) ?? 'pending',
    failedReason: str(a.failed_reason) ?? str(a.exception),
    shipmentId,
  };
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

interface JsonApiResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string; type?: string } }>;
}
interface JsonApi {
  data?: JsonApiResource;
  included?: JsonApiResource[];
}
