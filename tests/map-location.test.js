const test = require("node:test");
const assert = require("node:assert/strict");

const MapLocation = require("../assets/map-location.js");

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
    return /장소 또는 주소/.test(error.message);
  });
  await assert.rejects(() => MapLocation.resolve(maps, "존재하지 않는 장소"), (error) => {
    assert.equal(error.code, "NOT_FOUND");
    return /찾지 못했습니다/.test(error.message);
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
    return /사용할 수 없습니다/.test(error.message);
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
