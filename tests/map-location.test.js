const test = require("node:test");
const assert = require("node:assert/strict");

const MapLocation = require("../assets/integrations/map-location.js");

test("a NAVER coordinate URL wins over the display name without geocoding", async () => {
  const coordinates = await MapLocation.resolve(null, "unrelated name", "https://map.naver.com/?lat=37.5741694&lng=126.9916905");
  assert.deepEqual(coordinates, { latitude: 37.5741694, longitude: 126.9916905 });
});

test("place and short URLs do not silently geocode a display name", async () => {
  for (const url of ["https://map.naver.com/p/entry/place/1266673496", "https://naver.me/xAtWyIdS"]) {
    await assert.rejects(MapLocation.resolve(null, "서울시청", url), { code: "URL_LOCATION_UNAVAILABLE" });
  }
});

test("untrusted hosts and out of range coordinates cannot become a map position", async () => {
  for (const url of ["https://map.naver.com.evil.test/?lat=37&lng=127", "javascript:alert(1)", "https://map.naver.com/?lat=91&lng=127", "https://map.naver.com/?lat=&lng=127"]) {
    await assert.rejects(MapLocation.resolve(null, "서울시청", url), { code: "INVALID_MAP_URL" });
  }
});

test("URL pasted into the place field is never submitted as an address", async () => {
  await assert.rejects(MapLocation.resolve(null, "https://naver.me/xAtWyIdS"), { code: "URL_LOCATION_UNAVAILABLE" });
});

test("resolve converts the first NAVER geocoder address into latitude and longitude", async () => {
  const maps = {
    Service: {
      Status: { OK: 200 },
      geocode({ query }, callback) {
        assert.equal(query, "서울 성동구 성수이로 88");
        callback(200, { v2: { addresses: [{ x: "127.0559", y: "37.5446" }] } });
      }
    }
  };

  assert.deepEqual(await MapLocation.resolve(maps, " 서울 성동구 성수이로 88 "), {
    latitude: 37.5446,
    longitude: 127.0559
  });
});

test("resolve rejects empty and unsuccessful geocoder results", async () => {
  const maps = {
    Service: {
      Status: { OK: 200 },
      geocode(_options, callback) {
        callback(200, { v2: { addresses: [] } });
      }
    }
  };

  await assert.rejects(() => MapLocation.resolve(maps, ""), (error) => {
    assert.equal(error.code, "EMPTY_QUERY");
    // The studio picks the wording from the code; the message is machine text.
    return error.message === "EMPTY_QUERY";
  });
  await assert.rejects(() => MapLocation.resolve(maps, "존재하지 않는 장소"), (error) => {
    assert.equal(error.code, "NOT_FOUND");
    return error.message === "NOT_FOUND";
  });
});

test("resolve identifies unavailable geocoding separately from an empty result", async () => {
  const maps = {
    Service: {
      Status: { OK: 200 },
      geocode(_options, callback) {
        callback(500, {});
      }
    }
  };

  await assert.rejects(() => MapLocation.resolve(maps, "서울 성동구 성수이로 88"), (error) => {
    assert.equal(error.code, "SERVICE_UNAVAILABLE");
    return error.message === "SERVICE_UNAVAILABLE";
  });
});

test("resolve supports the legacy NAVER geocoder response shape", async () => {
  const maps = {
    Service: {
      Status: { OK: 200 },
      geocode(_options, callback) {
        callback(200, { result: { items: [{ point: { x: 127.1, y: 37.5 } }] } });
      }
    }
  };

  assert.deepEqual(await MapLocation.resolve(maps, "성수역"), {
    latitude: 37.5,
    longitude: 127.1
  });
});

test("Google place links trust the pinned place, not the camera centre", async () => {
  const url = "https://www.google.com/maps/place/Eiffel+Tower/@48.8583701,2.2919064,17z/data=!3m1!4b1!4m6!3m5!1s0x47e66e2964e34e2d:0x8ddca9ee380ef7e0!8m2!3d48.8583701!4d2.2944813!16zL20vMDJqODE";
  assert.deepEqual(await MapLocation.resolve(null, "unrelated name", url), { latitude: 48.8583701, longitude: 2.2944813 });
});

test("Google links with an explicit coordinate pair are trusted on any Google country domain", async () => {
  const cases = [
    ["https://www.google.com/maps/search/?api=1&query=35.6585805,139.7454329", { latitude: 35.6585805, longitude: 139.7454329 }],
    ["https://maps.google.com/?q=37.5741694,126.9916905", { latitude: 37.5741694, longitude: 126.9916905 }],
    ["https://www.google.co.kr/maps/dir/?api=1&destination=-33.8567844,151.2152967", { latitude: -33.8567844, longitude: 151.2152967 }],
    ["https://www.google.com/maps/search/40.6892,+-74.0445", { latitude: 40.6892, longitude: -74.0445 }]
  ];
  for (const [url, expected] of cases) {
    assert.deepEqual(await MapLocation.resolve(null, "", url), expected, url);
  }
});

test("Google short links, text searches and camera-only links never become a marker", async () => {
  for (const url of [
    "https://maps.app.goo.gl/AbCdEf123",
    "https://goo.gl/maps/AbCdEf123",
    "https://www.google.com/maps?q=Eiffel+Tower",
    "https://www.google.com/maps/@48.8583701,2.2919064,17z"
  ]) {
    await assert.rejects(MapLocation.resolve(null, "Eiffel Tower", url), { code: "URL_LOCATION_UNAVAILABLE" }, url);
  }
});

test("look-alike Google hosts and non-map Google pages are rejected", async () => {
  for (const url of [
    "https://www.google.com.evil.test/maps?q=37,127",
    "https://www.google.com/search?q=37,127",
    "https://google.evil.com/maps?q=37,127",
    "https://www.google.com/maps?q=91,127"
  ]) {
    await assert.rejects(MapLocation.resolve(null, "", url), { code: "INVALID_MAP_URL" }, url);
  }
});

test("Google geocoding reads LatLng methods from the first result", async () => {
  const maps = {
    Geocoder: class {
      geocode({ address }, callback) {
        assert.equal(address, "5 Avenue Anatole France, Paris");
        callback([{ geometry: { location: { lat: () => 48.8583701, lng: () => 2.2944813 } } }], "OK");
      }
    }
  };
  assert.deepEqual(
    await MapLocation.resolve(maps, " 5 Avenue Anatole France, Paris ", "", { provider: "google" }),
    { latitude: 48.8583701, longitude: 2.2944813 }
  );
});

test("Google geocoding separates an unknown address from a broken service", async () => {
  const withStatus = (status) => ({ Geocoder: class { geocode(_request, callback) { callback([], status); } } });
  await assert.rejects(MapLocation.resolve(withStatus("ZERO_RESULTS"), "nowhere", "", { provider: "google" }), { code: "NOT_FOUND" });
  for (const status of ["REQUEST_DENIED", "OVER_QUERY_LIMIT", "UNKNOWN_ERROR"]) {
    await assert.rejects(MapLocation.resolve(withStatus(status), "Paris", "", { provider: "google" }), { code: "SERVICE_UNAVAILABLE" });
  }
  await assert.rejects(MapLocation.resolve(null, "Paris", "", { provider: "google" }), { code: "SERVICE_UNAVAILABLE" });
});

test("an unknown provider falls back to NAVER geocoding", async () => {
  assert.equal(MapLocation.normalizeProvider("kakao"), "naver");
  assert.equal(MapLocation.normalizeProvider("google"), "google");
});

test("a geocoder that never answers is reported as unavailable instead of searching forever", async () => {
  const silent = { Geocoder: class { geocode() {} } };
  await assert.rejects(
    MapLocation.resolve(silent, "Paris", "", { provider: "google", timeoutMs: 20 }),
    { code: "SERVICE_UNAVAILABLE" }
  );
});
