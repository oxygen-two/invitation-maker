(function (root) {
  const locationError = (code, message) => Object.assign(new Error(message), { code });

  const coordinatesFrom = (response = {}) => {
    const address = response.v2?.addresses?.[0];
    const legacyPoint = response.result?.items?.[0]?.point;
    const longitude = Number(address?.x ?? legacyPoint?.x);
    const latitude = Number(address?.y ?? legacyPoint?.y);

    return Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude }
      : null;
  };

  const coordinatesFromUrl = (value) => {
    let url;
    try { url = new URL(value); } catch { throw locationError("INVALID_MAP_URL", "올바른 네이버 지도 URL을 입력해 주세요."); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port
      || !['map.naver.com', 'maps.naver.com', 'm.map.naver.com', 'm.place.naver.com', 'pcmap.place.naver.com', 'naver.me'].includes(url.hostname)) {
      throw locationError("INVALID_MAP_URL", "네이버 지도 URL을 입력해 주세요.");
    }
    // A place ID, short link, or camera centre is not a verified marker location.
    if (url.hostname === 'naver.me' || url.pathname.includes('/place/')
      || url.hostname.includes('.place.naver.com')) {
      throw locationError("URL_LOCATION_UNAVAILABLE", "이 링크에서는 위치를 자동으로 확인할 수 없습니다. 지도 열기 버튼으로 확인해 주세요.");
    }
    const lat = url.searchParams.get('lat');
    const lng = url.searchParams.get('lng');
    if (lat === null && lng === null) {
      throw locationError("URL_LOCATION_UNAVAILABLE", "좌표가 없는 링크입니다. 지도 열기 버튼으로 확인해 주세요.");
    }
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!lat?.trim() || !lng?.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw locationError("INVALID_MAP_URL", "지도 URL의 좌표가 올바르지 않습니다.");
    }
    return { latitude, longitude };
  };

  const resolve = (maps, value, mapUrl = "") => {
    const query = String(value || "").trim();
    const preferredUrl = String(mapUrl || "").trim() || (/^https?:\/\//i.test(query) ? query : "");
    if (preferredUrl) {
      try { return Promise.resolve(coordinatesFromUrl(preferredUrl)); }
      catch (error) { return Promise.reject(error); }
    }
    if (!query) return Promise.reject(locationError("EMPTY_QUERY", "장소 또는 주소를 입력해 주세요."));
    if (!maps?.Service?.geocode) {
      return Promise.reject(locationError("SERVICE_UNAVAILABLE", "지도 위치 검색을 사용할 수 없습니다."));
    }

    return new Promise((onResolve, onReject) => {
      maps.Service.geocode({ query }, (status, response) => {
        if (status !== maps.Service.Status.OK) {
          onReject(locationError("SERVICE_UNAVAILABLE", "지도 위치 검색을 사용할 수 없습니다."));
          return;
        }

        const coordinates = coordinatesFrom(response);
        if (!coordinates) {
          onReject(locationError("NOT_FOUND", "장소를 찾지 못했습니다."));
          return;
        }
        onResolve(coordinates);
      });
    });
  };

  const api = { coordinatesFrom, coordinatesFromUrl, resolve };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MapLocation = api;
})(typeof window !== "undefined" ? window : globalThis);
