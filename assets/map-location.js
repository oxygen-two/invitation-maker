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

  const resolve = (maps, value) => {
    const query = String(value || "").trim();
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

  const api = { coordinatesFrom, resolve };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MapLocation = api;
})(typeof window !== "undefined" ? window : globalThis);
