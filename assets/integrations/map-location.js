(function (root) {
  /* Lookups fail with a code and nothing else. The studio already decides the
     wording from the code alone — a bad NAVER link and a bad Google link are
     both INVALID_MAP_URL and both read as map.invalidUrl — so a sentence here
     would be copy nobody displays, frozen in one language. The message is set
     to the code so a fault report still names the failure. */
  const locationError = (code, message = code) => Object.assign(new Error(message), { code });

  const PROVIDERS = Object.freeze(["naver", "google"]);
  const normalizeProvider = (value) => (PROVIDERS.includes(value) ? value : "naver");

  const NAVER_HOSTS = Object.freeze([
    "map.naver.com", "maps.naver.com", "m.map.naver.com",
    "m.place.naver.com", "pcmap.place.naver.com", "naver.me"
  ]);
  // google.com, google.co.kr, google.de … with or without www./maps.
  const GOOGLE_HOST = /^(?:www\.|maps\.)?google\.(?:com|[a-z]{2}|com?\.[a-z]{2})$/;
  const GOOGLE_SHORT_HOSTS = Object.freeze(["maps.app.goo.gl", "goo.gl"]);

  const inRange = (latitude, longitude) => Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

  const coordinatesFrom = (response = {}) => {
    const address = response.v2?.addresses?.[0];
    const legacyPoint = response.result?.items?.[0]?.point;
    const longitude = Number(address?.x ?? legacyPoint?.x);
    const latitude = Number(address?.y ?? legacyPoint?.y);

    return Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude }
      : null;
  };

  // google.maps.LatLng exposes lat()/lng() methods; plain literals carry numbers.
  const coordinatesFromGoogle = (results = []) => {
    const location = results?.[0]?.geometry?.location;
    const read = (key) => (typeof location?.[key] === "function" ? location[key]() : location?.[key]);
    const latitude = Number(read("lat"));
    const longitude = Number(read("lng"));
    return location && inRange(latitude, longitude) ? { latitude, longitude } : null;
  };

  const parseUrl = (value) => {
    let url;
    try { url = new URL(value); } catch { throw locationError("INVALID_MAP_URL"); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) {
      throw locationError("INVALID_MAP_URL");
    }
    return url;
  };

  const naverCoordinates = (url) => {
    // A place ID, short link, or camera centre is not a verified marker location.
    if (url.hostname === "naver.me" || url.pathname.includes("/place/")
      || url.hostname.includes(".place.naver.com")) {
      throw locationError("URL_LOCATION_UNAVAILABLE");
    }
    const lat = url.searchParams.get("lat");
    const lng = url.searchParams.get("lng");
    if (lat === null && lng === null) {
      throw locationError("URL_LOCATION_UNAVAILABLE");
    }
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!lat?.trim() || !lng?.trim() || !inRange(latitude, longitude)) {
      throw locationError("INVALID_MAP_URL");
    }
    return { latitude, longitude };
  };

  const COORDINATE_PAIR = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
  const pairFrom = (text) => {
    if (typeof text !== "string") return null;
    let decoded = text.replace(/\+/g, " ");
    try { decoded = decodeURIComponent(decoded); } catch { /* keep raw */ }
    const match = decoded.match(COORDINATE_PAIR);
    if (!match) return null;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (!inRange(latitude, longitude)) {
      throw locationError("INVALID_MAP_URL");
    }
    return { latitude, longitude };
  };

  /* Google links carry several kinds of numbers and only some of them are the
     place. `!3d<lat>!4d<lng>` inside a /maps/place/ data blob is the pinned
     place; q=, query= and destination= with a numeric pair are explicit
     positions. `@lat,lng,zoom` is only where the camera was looking when the
     link was copied — the same "camera centre is not a marker" rule the NAVER
     parser follows — so a link that has nothing else is not trusted. */
  const googleCoordinates = (url) => {
    if (GOOGLE_SHORT_HOSTS.includes(url.hostname)) {
      throw locationError("URL_LOCATION_UNAVAILABLE");
    }
    const placeMatches = [...`${url.pathname}${url.search}`.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
    if (placeMatches.length) {
      const [, lat, lng] = placeMatches[placeMatches.length - 1];
      const coordinates = { latitude: Number(lat), longitude: Number(lng) };
      if (!inRange(coordinates.latitude, coordinates.longitude)) {
        throw locationError("INVALID_MAP_URL");
      }
      return coordinates;
    }
    for (const key of ["q", "query", "destination"]) {
      const pair = pairFrom(url.searchParams.get(key));
      if (pair) return pair;
    }
    const pathPair = url.pathname.match(/\/maps\/(?:search|place|dir\/[^/]*)\/([^/@]+)/);
    const fromPath = pathPair ? pairFrom(pathPair[1]) : null;
    if (fromPath) return fromPath;
    throw locationError("URL_LOCATION_UNAVAILABLE");
  };

  const isGoogleMapsUrl = (url) => GOOGLE_SHORT_HOSTS.includes(url.hostname)
    ? url.hostname === "maps.app.goo.gl" || url.pathname.startsWith("/maps")
    : GOOGLE_HOST.test(url.hostname) && (url.hostname.startsWith("maps.") || url.pathname.startsWith("/maps"));

  /* Coordinates are WGS84 for both services, so a link from either one yields
     a usable position whichever map the invitation displays. */
  const coordinatesFromUrl = (value) => {
    const url = parseUrl(value);
    if (NAVER_HOSTS.includes(url.hostname)) return naverCoordinates(url);
    if (isGoogleMapsUrl(url)) return googleCoordinates(url);
    throw locationError("INVALID_MAP_URL");
  };

  /* A rejected key does not always answer a lookup: Google reports a
     referrer or billing problem through gm_authFailure and may never call the
     geocoder back. Without a deadline the studio would say "searching"
     forever, so a silent service counts as an unavailable one. */
  const DEFAULT_LOOKUP_TIMEOUT_MS = 10000;
  const withDeadline = (promise, timeoutMs) => new Promise((onResolve, onReject) => {
    const timer = setTimeout(
      () => onReject(locationError("SERVICE_UNAVAILABLE")),
      timeoutMs
    );
    promise.then(
      (value) => { clearTimeout(timer); onResolve(value); },
      (error) => { clearTimeout(timer); onReject(error); }
    );
  });

  const geocodeNaver = (maps, query) => {
    if (!maps?.Service?.geocode) {
      return Promise.reject(locationError("SERVICE_UNAVAILABLE"));
    }
    return new Promise((onResolve, onReject) => {
      maps.Service.geocode({ query }, (status, response) => {
        if (status !== maps.Service.Status.OK) {
          onReject(locationError("SERVICE_UNAVAILABLE"));
          return;
        }
        const coordinates = coordinatesFrom(response);
        if (!coordinates) {
          onReject(locationError("NOT_FOUND"));
          return;
        }
        onResolve(coordinates);
      });
    });
  };

  const geocodeGoogle = (maps, query) => {
    if (typeof maps?.Geocoder !== "function") {
      return Promise.reject(locationError("SERVICE_UNAVAILABLE"));
    }
    return new Promise((onResolve, onReject) => {
      try {
        new maps.Geocoder().geocode({ address: query }, (results, status) => {
          if (status === "ZERO_RESULTS") {
            onReject(locationError("NOT_FOUND"));
            return;
          }
          if (status !== "OK") {
            onReject(locationError("SERVICE_UNAVAILABLE"));
            return;
          }
          const coordinates = coordinatesFromGoogle(results);
          if (!coordinates) {
            onReject(locationError("NOT_FOUND"));
            return;
          }
          onResolve(coordinates);
        });
      } catch {
        onReject(locationError("SERVICE_UNAVAILABLE"));
      }
    });
  };

  const resolve = (maps, value, mapUrl = "", { provider, timeoutMs = DEFAULT_LOOKUP_TIMEOUT_MS } = {}) => {
    const query = String(value || "").trim();
    const preferredUrl = String(mapUrl || "").trim() || (/^https?:\/\//i.test(query) ? query : "");
    if (preferredUrl) {
      try { return Promise.resolve(coordinatesFromUrl(preferredUrl)); }
      catch (error) { return Promise.reject(error); }
    }
    if (!query) return Promise.reject(locationError("EMPTY_QUERY"));
    return withDeadline(normalizeProvider(provider) === "google"
      ? geocodeGoogle(maps, query)
      : geocodeNaver(maps, query), timeoutMs);
  };

  const api = { PROVIDERS, normalizeProvider, coordinatesFrom, coordinatesFromGoogle, coordinatesFromUrl, resolve };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MapLocation = api;
})(typeof window !== "undefined" ? window : globalThis);
