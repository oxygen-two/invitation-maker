const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const InvitationStorage = require("../assets/invitation-storage.js");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const nextTask = (callback) => queueMicrotask(callback);

const createRequest = () => ({
  result: undefined,
  error: null,
  onsuccess: null,
  onerror: null
});

const settleRequest = (request, { result, error } = {}) => {
  nextTask(() => {
    request.result = result;
    request.error = error || null;
    (error ? request.onerror : request.onsuccess)?.({ target: request });
  });
};

const createFakeIndexedDB = ({ autoComplete = true } = {}) => {
  const records = new Map();
  const calls = { open: [], createObjectStore: [], transaction: [], transactionObjects: [] };
  let upgraded = false;

  const database = {
    objectStoreNames: {
      contains(name) {
        return upgraded && name === InvitationStorage.STORE_NAME;
      }
    },
    createObjectStore(name, options) {
      calls.createObjectStore.push({ name, options });
      upgraded = true;
      return {};
    },
    transaction(name, mode) {
      calls.transaction.push({ name, mode });
      const transaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore(storeName) {
          assert.equal(storeName, InvitationStorage.STORE_NAME);
          const complete = (request, result) => {
            nextTask(() => {
              request.result = result;
              request.onsuccess?.({ target: request });
              if (autoComplete) {
                nextTask(() => transaction.oncomplete?.({ target: transaction }));
              }
            });
            return request;
          };

          return {
            getAll() {
              return complete(createRequest(), [...records.values()]);
            },
            get(id) {
              return complete(createRequest(), records.get(id));
            },
            put(record) {
              records.set(record.id, record);
              return complete(createRequest(), record.id);
            },
            delete(id) {
              records.delete(id);
              return complete(createRequest(), undefined);
            }
          };
        }
      };
      calls.transactionObjects.push(transaction);
      return transaction;
    },
    close() {}
  };

  return {
    calls,
    open(name, version) {
      calls.open.push({ name, version });
      const request = createRequest();
      request.transaction = { abort() {} };
      nextTask(() => {
        request.result = database;
        if (!upgraded) request.onupgradeneeded?.({ oldVersion: 0, target: request });
        request.onsuccess?.({ target: request });
      });
      return request;
    }
  };
};

test("exports the fixed IndexedDB repository contract", () => {
  assert.equal(InvitationStorage.DB_NAME, "invitation-maker");
  assert.equal(InvitationStorage.DB_VERSION, 1);
  assert.equal(InvitationStorage.STORE_NAME, "invitations");
  assert.equal(typeof InvitationStorage.open, "function");
  assert.equal(typeof InvitationStorage.list, "function");
  assert.equal(typeof InvitationStorage.get, "function");
  assert.equal(typeof InvitationStorage.put, "function");
  assert.equal(typeof InvitationStorage.remove, "function");
});

test("open rejects clearly when IndexedDB is unavailable", async () => {
  await assert.rejects(
    () => InvitationStorage.open(undefined),
    /IndexedDB.*사용할 수 없습니다/i
  );
});

test("requestToPromise resolves the request result", async () => {
  const request = createRequest();
  const resultPromise = InvitationStorage.requestToPromise(request);

  settleRequest(request, { result: { id: "saved" } });

  assert.deepEqual(await resultPromise, { id: "saved" });
});

test("requestToPromise rejects with the original request error", async () => {
  const request = createRequest();
  const originalError = new Error("request failed");
  const resultPromise = InvitationStorage.requestToPromise(request);

  settleRequest(request, { error: originalError });

  await assert.rejects(resultPromise, (error) => error === originalError);
});

test("transactionToPromise resolves completion and preserves failures", async () => {
  const completed = { error: null, oncomplete: null, onerror: null, onabort: null };
  const completedPromise = InvitationStorage.transactionToPromise(completed);
  completed.oncomplete();
  await completedPromise;

  for (const eventName of ["onerror", "onabort"]) {
    const originalError = new Error(`${eventName} failed`);
    const failed = { error: originalError, oncomplete: null, onerror: null, onabort: null };
    const failedPromise = InvitationStorage.transactionToPromise(failed);
    failed[eventName]();
    await assert.rejects(failedPromise, (error) => error === originalError);
  }
});

test("open creates the versioned invitations store with id keyPath", async () => {
  const indexedDB = createFakeIndexedDB();
  const database = await InvitationStorage.open(indexedDB);

  assert.equal(typeof database.transaction, "function");
  assert.deepEqual(indexedDB.calls.open, [{ name: "invitation-maker", version: 1 }]);
  assert.deepEqual(indexedDB.calls.createObjectStore, [
    { name: "invitations", options: { keyPath: "id" } }
  ]);
});

test("open closes a database connection that succeeds after a blocked rejection", async () => {
  const request = createRequest();
  let closeCount = 0;
  const database = { close: () => { closeCount += 1; } };
  const indexedDB = { open: () => request };
  const openPromise = InvitationStorage.open(indexedDB);

  request.onblocked();
  await assert.rejects(openPromise, /업그레이드가 차단되었습니다/);
  request.result = database;
  request.onsuccess();

  assert.equal(closeCount, 1);
});

test("browser pages load storage before their consumers", () => {
  const indexScripts = [...read("index.html").matchAll(/<script src="([^"]+)"(?: defer)?><\/script>/g)]
    .map((match) => match[1]);
  const viewerScripts = [...read("viewer.html").matchAll(/<script src="([^"]+)"(?: defer)?><\/script>/g)]
    .map((match) => match[1]);

  assert.ok(indexScripts.indexOf("assets/invitation-storage.js") >= 0);
  assert.ok(indexScripts.indexOf("assets/invitation-storage.js") < indexScripts.indexOf("assets/app.js"));
  assert.ok(viewerScripts.indexOf("assets/invitation-storage.js") >= 0);
  assert.ok(viewerScripts.indexOf("assets/invitation-storage.js") < viewerScripts.indexOf("assets/viewer.js"));
});

test("CRUD uses the invitations store and lists newest records with deterministic ties", async (t) => {
  const originalIndexedDB = globalThis.indexedDB;
  const indexedDB = createFakeIndexedDB();
  globalThis.indexedDB = indexedDB;
  t.after(() => {
    if (originalIndexedDB === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = originalIndexedDB;
  });

  const older = { id: "older", title: "Older", createdAt: "2026-09-01T00:00:00.000Z", source: "maker", html: "<p>old</p>" };
  const tieB = { id: "tie-b", title: "Tie B", createdAt: "2026-09-05T00:00:00.000Z", source: "maker", html: "<p>b</p>" };
  const tieA = { id: "tie-a", title: "Tie A", createdAt: "2026-09-05T00:00:00.000Z", source: "upload", html: "<p>a</p>" };

  assert.equal(await InvitationStorage.put(older), "older");
  await InvitationStorage.put(tieB);
  await InvitationStorage.put(tieA);
  assert.deepEqual((await InvitationStorage.list()).map((record) => record.id), ["tie-a", "tie-b", "older"]);
  assert.deepEqual(await InvitationStorage.get("tie-b"), tieB);

  await InvitationStorage.remove("tie-b");
  assert.equal(await InvitationStorage.get("tie-b"), undefined);
  assert.equal(indexedDB.calls.transaction.every((call) => call.name === "invitations"), true);
  assert.deepEqual(
    indexedDB.calls.transaction.map((call) => call.mode),
    ["readwrite", "readwrite", "readwrite", "readonly", "readonly", "readwrite", "readonly"]
  );
});

test("put and remove settle only after their transactions complete", async (t) => {
  const originalIndexedDB = globalThis.indexedDB;
  const indexedDB = createFakeIndexedDB({ autoComplete: false });
  globalThis.indexedDB = indexedDB;
  t.after(() => {
    if (originalIndexedDB === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = originalIndexedDB;
  });

  const record = { id: "pending", title: "Pending", createdAt: "2026-09-05T00:00:00.000Z", source: "maker", html: "<p>pending</p>" };
  let putSettled = false;
  const putPromise = InvitationStorage.put(record).then(() => { putSettled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(putSettled, false);
  indexedDB.calls.transactionObjects[0].oncomplete();
  await putPromise;

  let removeSettled = false;
  const removePromise = InvitationStorage.remove(record.id).then(() => { removeSettled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(removeSettled, false);
  indexedDB.calls.transactionObjects[1].oncomplete();
  await removePromise;
});

test("list places invalid createdAt records after valid dates with deterministic id order", async (t) => {
  const originalIndexedDB = globalThis.indexedDB;
  const indexedDB = createFakeIndexedDB();
  globalThis.indexedDB = indexedDB;
  t.after(() => {
    if (originalIndexedDB === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = originalIndexedDB;
  });

  await InvitationStorage.put({ id: "invalid-z", createdAt: "not-a-date" });
  await InvitationStorage.put({ id: "valid", createdAt: "2026-09-05T00:00:00.000Z" });
  await InvitationStorage.put({ id: "invalid-a", createdAt: "" });

  assert.deepEqual((await InvitationStorage.list()).map((record) => record.id), [
    "valid",
    "invalid-a",
    "invalid-z"
  ]);
});
