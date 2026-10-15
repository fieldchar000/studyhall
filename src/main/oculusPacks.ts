// Studyhall's additions to God's Eye View, applied to the installed copy after every install or
// update. Each pack is a set of small, anchored edits: if God's Eye View has changed so that any
// anchor is missing, that pack is skipped as a whole (and reported) rather than half-applied, so
// an update can never leave the globe broken. (The added JavaScript avoids template strings so
// it can sit inside this file's own.)

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

interface Edit {
  file: string
  /** Text that must appear exactly once in the file. */
  anchor: string
  replace?: string // replaces the anchor
  append?: string // added at the end of the file (the anchor is only checked)
}

interface Pack {
  id: string
  name: string
  edits: Edit[]
}

const MARK = '/* studyhall-pack:'

// ---------- Singapore: LTA expressway traffic cameras ----------

const SG_CONSTANTS = `

${MARK}sg-cameras */
/** Singapore (added by Studyhall): LTA expressway traffic cameras. With a free LTA DataMall key
 * (LTA_DATAMALL_KEY) all ~90 cameras, refreshed every few minutes; without one, the keyless
 * data.gov.sg feed (currently the Woodlands and Tuas checkpoint cameras). Both under the
 * Singapore Open Data Licence. Frame links change on every refresh (DataMall's expire after
 * five minutes), so the catalog keeps camera ids and the newest frame is looked up when viewed. */
export const SG_TRAFFIC_IMAGES_URL = 'https://api.data.gov.sg/v1/transport/traffic-images';
export const SG_DATAMALL_IMAGES_URL = 'https://datamall2.mytransport.sg/ltaodataservice/Traffic-Imagesv2';
export const SINGAPORE_CENTER = { lat: 1.3521, lon: 103.8198 };

let sgCache = { at: 0, cams: [] };
/** Newest Singapore camera list: [{ id, lat, lon, image }], cached for 45 s. */
export async function singaporeCameraListing() {
  if (Date.now() - sgCache.at < 45000 && sgCache.cams.length) return sgCache.cams;
  const key = String(process.env.LTA_DATAMALL_KEY || '').trim();
  const cams = [];
  if (key) {
    const resp = await fetch(SG_DATAMALL_IMAGES_URL, {
      headers: { AccountKey: key, accept: 'application/json' },
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) throw new Error('LTA DataMall answered ' + resp.status);
    const body = await resp.json();
    for (const c of Array.isArray(body && body.value) ? body.value : []) {
      cams.push({ id: String(c.CameraID == null ? '' : c.CameraID), lat: Number(c.Latitude), lon: Number(c.Longitude), image: String(c.ImageLink || '') });
    }
  } else {
    const resp = await fetch(SG_TRAFFIC_IMAGES_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) throw new Error('data.gov.sg answered ' + resp.status);
    const body = await resp.json();
    const list = body && body.items && body.items[0] && Array.isArray(body.items[0].cameras) ? body.items[0].cameras : [];
    for (const c of list) {
      const loc = c.location || {};
      cams.push({ id: String(c.camera_id == null ? '' : c.camera_id), lat: Number(loc.latitude), lon: Number(loc.longitude), image: String(c.image || '') });
    }
  }
  const ok = cams.filter((c) => /^\\d+$/.test(c.id) && c.lat > 1.1 && c.lat < 1.5 && c.lon > 103.5 && c.lon < 104.1);
  sgCache = { at: Date.now(), cams: ok };
  return ok;
}

/** Only frames from the official hosts (data.gov.sg images, LTA's image bucket). */
export function isSingaporeFrameUrl(url) {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      (u.hostname === 'images.data.gov.sg' ||
        /(^|\\.)dm-traffic-images\\.s3[.a-z0-9-]*\\.amazonaws\\.com$/.test(u.hostname) ||
        u.hostname.endsWith('.mytransport.sg'))
    );
  } catch {
    return false;
  }
}
`

const SG_LOADER = `

${MARK}sg-cameras */
/**
 * Singapore (added by Studyhall): LTA traffic cameras. The listing has positions and ids but no
 * viewing direction, so poses start as low-confidence priors you can calibrate like any other.
 *
 * @returns {Promise<Array<object>>} Normalized camera source objects.
 */
export async function loadSingaporeSourcesFromOpenData() {
  try {
    const cams = await singaporeCameraListing();
    const out = cams.map((c) => {
      const id = 'sg-' + c.id;
      return {
        id,
        name: 'Singapore traffic camera ' + c.id,
        city: 'Singapore',
        cityId: 'singapore',
        provider: 'Land Transport Authority',
        lat: c.lat,
        lon: c.lon,
        headingDeg: fallbackHeadingFromId(id),
        headingConfidence: 'low',
        pitchDeg: -18,
        fovDeg: 44,
        rangeM: 160,
        mountHeightM: 10,
        groundElevationM: 15,
        feedType: 'image',
        url: SG_TRAFFIC_IMAGES_URL + '#' + c.id,
        snapshotUrl: SG_TRAFFIC_IMAGES_URL + '#' + c.id,
        sourceKind: 'sg-lta',
        license: 'Contains information from the Land Transport Authority (LTA DataMall / data.gov.sg), Singapore Open Data Licence',
        code: cameraDisplayCode('SG ' + c.id),
      };
    });
    console.log('[CCTV] Loaded Singapore camera sources: ' + out.length);
    return prioritizeSources(out, 200, [SINGAPORE_CENTER]);
  } catch (error) {
    console.warn('[CCTV] Singapore camera download error:', (error && error.message) || error);
    return [];
  }
}
`

const SG_SNAPSHOT = `

${MARK}sg-cameras */
/** Singapore (added by Studyhall): the newest frame for an LTA camera, from the official hosts only.
 * The image host labels frames application/octet-stream, so the bytes themselves must be a JPEG. */
export async function fetchSingaporeSnapshot(cameraId, { fetchImpl = fetch } = {}) {
  const rawId = String(cameraId || '').replace(/^sg-/, '');
  if (!/^\\d+$/.test(rawId)) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CCTV_FRAME_FETCH_TIMEOUT_MS);
  try {
    const cam = (await singaporeCameraListing()).find((c) => c.id === rawId);
    if (!cam || !isSingaporeFrameUrl(cam.image)) return null;
    const upstream = await fetchWithinHost(cam.image, { headers: { 'User-Agent': 'gods-eye-view-cctv-proxy/1.0' }, signal: controller.signal }, fetchImpl);
    if (!upstream || !upstream.ok) return null;
    const body = await readCappedResponseBytes(upstream, CCTV_FRAME_MAX_BODY_BYTES);
    if (!body || body.length < 3 || body[0] !== 0xff || body[1] !== 0xd8 || body[2] !== 0xff) return null;
    return { ok: true, body, contentType: 'image/jpeg' };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
    controller.abort();
  }
}
`

const PACKS: Pack[] = [
  {
    id: 'sg-cameras',
    name: 'Singapore traffic cameras',
    edits: [
      { file: 'server/providers/cctv/constants.js', anchor: 'export const CCTV_SOURCE_FETCH_TIMEOUT_MS', append: SG_CONSTANTS },
      {
        file: 'server/providers/cctv/sources.js',
        anchor: "  NYC_ANCHORS,\n} from './constants.js';",
        replace: "  NYC_ANCHORS,\n  SG_TRAFFIC_IMAGES_URL,\n  SINGAPORE_CENTER,\n  singaporeCameraListing,\n} from './constants.js';"
      },
      { file: 'server/providers/cctv/sources.js', anchor: 'export async function loadNswSourcesFromOpenData()', append: SG_LOADER },
      {
        file: 'server/providers/cctv/catalog.js',
        anchor: "  loadNycSourcesFromOpenData,\n} from './sources.js';",
        replace: "  loadNycSourcesFromOpenData,\n  loadSingaporeSourcesFromOpenData,\n} from './sources.js';"
      },
      {
        file: 'server/providers/cctv/catalog.js',
        anchor: '  {\n    // NYC DOT requires a data-sharing agreement',
        replace: "  {\n    name: 'singapore',\n    enabled: () => envEnabled('CCTV_SINGAPORE_ENABLED'),\n    load: loadSingaporeSourcesFromOpenData,\n  },\n  {\n    // NYC DOT requires a data-sharing agreement"
      },
      {
        file: 'server/providers/cctv/media.js',
        anchor: "  NSW_IMAGE_USER_AGENT,\n} from './constants.js';",
        replace: "  NSW_IMAGE_USER_AGENT,\n  singaporeCameraListing,\n  isSingaporeFrameUrl,\n} from './constants.js';"
      },
      { file: 'server/providers/cctv/media.js', anchor: 'export async function fetchCctvImageFromUpstream(', append: SG_SNAPSHOT },
      { file: 'server/providers/cctv.js', anchor: '  fetchTxdotSnapshot,\n  fetchCctvMediaUpstream,', replace: '  fetchTxdotSnapshot,\n  fetchSingaporeSnapshot,\n  fetchCctvMediaUpstream,' },
      {
        file: 'server/providers/cctv.js',
        anchor: "          source?.sourceKind === 'txdot-its'\n            ? await fetchTxdotSnapshot(upstreamCandidate)\n            : await fetchCctvImageFromUpstream(upstreamCandidate);",
        replace:
          "          source?.sourceKind === 'txdot-its'\n            ? await fetchTxdotSnapshot(upstreamCandidate)\n            : source?.sourceKind === 'sg-lta'\n              ? await fetchSingaporeSnapshot(source.id)\n              : await fetchCctvImageFromUpstream(upstreamCandidate);"
      }
    ]
  }
]

export interface PackResult {
  applied: string[]
  skipped: string[] // names of packs God's Eye View has outgrown
}

/** Apply every pack to the God's Eye View copy in dir. Safe to run again (applied packs are left alone). */
export async function applyPacks(dir: string): Promise<PackResult> {
  const result: PackResult = { applied: [], skipped: [] }
  const norm = (s: string): string => s.replace(/\r\n/g, '\n')
  for (const pack of PACKS) {
    const files = new Map<string, string>()
    for (const e of pack.edits) if (!files.has(e.file)) files.set(e.file, norm(await readFile(join(dir, e.file), 'utf8').catch(() => '')))
    if ([...files.values()].some((t) => t.includes(`${MARK}${pack.id} */`))) {
      result.applied.push(pack.name) // already there
      continue
    }
    // Every anchor must be present exactly once, or the pack is skipped untouched.
    if (!pack.edits.every((e) => (files.get(e.file) ?? '').split(e.anchor).length === 2)) {
      result.skipped.push(pack.name)
      continue
    }
    for (const e of pack.edits) {
      let t = files.get(e.file)!
      if (e.replace !== undefined) t = t.replace(e.anchor, () => e.replace!)
      if (e.append !== undefined) t = t.trimEnd() + e.append
      files.set(e.file, t)
    }
    for (const [f, t] of files) await writeFile(join(dir, f), t)
    result.applied.push(pack.name)
  }
  return result
}
