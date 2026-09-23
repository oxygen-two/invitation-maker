(function exposeInvitationStorage(root, factory) {
  const invitationStorage = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = invitationStorage;
  }

  root.InvitationStorage = invitationStorage;
})(typeof globalThis === "object" ? globalThis : this, function createInvitationStorage(root) {
  "use strict";

  const DB_NAME = "invitation-maker";
  const DB_VERSION = 2;
  const STORE_NAME = "invitations";

  /* A failure here is machine news, not copy: the browser's own DOMException is
     passed through when there is one, and the fallback carries a code instead
     of a sentence. Nothing in this module can know the reader's language, and
     every place the studio actually tells someone that saving failed already
     has its own dictionary entry (status.draftFailed, status.saveFailed,
     status.removeFailed, status.storageUnavailable). */
  const storageError = (code) => Object.assign(new Error(code), { code });

  const requestToPromise = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || storageError("IDB_REQUEST_FAILED"));
  });

  const transactionToPromise = (transaction) => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    const rejectTransaction = () => {
      reject(transaction.error || storageError("IDB_TRANSACTION_FAILED"));
    };
    transaction.onerror = rejectTransaction;
    transaction.onabort = rejectTransaction;
  });

  function open(indexedDB) {
    const databaseFactory = arguments.length === 0 ? root.indexedDB : indexedDB;
    if (!databaseFactory || typeof databaseFactory.open !== "function") {
      return Promise.reject(storageError("IDB_UNAVAILABLE"));
    }

    return new Promise((resolve, reject) => {
      let request;
      try {
        request = databaseFactory.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(error);
        return;
      }

      let upgradeError = null;
      let blocked = false;
      let settled = false;
      const rejectOpen = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      request.onupgradeneeded = () => {
        try {
          const database = request.result;
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            database.createObjectStore(STORE_NAME, { keyPath: "id" });
          }
          if (!database.objectStoreNames.contains("drafts")) {
            database.createObjectStore("drafts", { keyPath: "id" });
          }
        } catch (error) {
          upgradeError = error;
          try {
            request.transaction?.abort();
          } catch {
            // The original upgrade failure is more useful than a secondary abort error.
          }
          rejectOpen(error);
        }
      };
      request.onsuccess = () => {
        if (blocked || settled) {
          request.result?.close?.();
          return;
        }
        settled = true;
        resolve(request.result);
      };
      request.onerror = () => {
        rejectOpen(upgradeError || request.error || storageError("IDB_OPEN_FAILED"));
      };
      request.onblocked = () => {
        blocked = true;
        rejectOpen(storageError("IDB_UPGRADE_BLOCKED"));
      };
    });
  }

  const withStore = async (mode, operation, storeName = STORE_NAME) => {
    const database = await open();
    try {
      const transaction = database.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      const [result] = await Promise.all([
        requestToPromise(request),
        transactionToPromise(transaction)
      ]);
      return result;
    } finally {
      database.close?.();
    }
  };

  const compareRecords = (left, right) => {
    const leftTime = Date.parse(String(left?.createdAt || ""));
    const rightTime = Date.parse(String(right?.createdAt || ""));
    const safeLeftTime = Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY;
    const safeRightTime = Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY;

    if (safeLeftTime !== safeRightTime) return safeRightTime - safeLeftTime;

    const leftId = String(left?.id || "");
    const rightId = String(right?.id || "");
    if (leftId < rightId) return -1;
    if (leftId > rightId) return 1;
    return 0;
  };

  /* The one thing a draft knows about itself that its invitation cannot say:
     the studio language its words were written in. It belongs on the record
     rather than inside the invitation, because it describes the authorship of
     the words — whether they are still our sample, ours to replace when the
     studio changes language — and not anything the invitation renders.

     No store upgrade goes with it. The field is not indexed and nothing reads
     it out of a key range, so an old record is complete the moment it is read:
     every draft written before this field existed came from a studio that had
     only Korean, which is exactly what the fallback says. Normalizing on the
     way out rather than migrating in place keeps that true for a draft written
     by a tab still running the old code.  */
  const DRAFT_LANGUAGE_FALLBACK = "ko";
  const draftLanguage = (value) => String(value || "").trim() || DRAFT_LANGUAGE_FALLBACK;

  const list = async () => {
    const records = await withStore("readonly", (store) => store.getAll());
    return (Array.isArray(records) ? records : []).slice().sort(compareRecords);
  };

  const get = (id) => withStore("readonly", (store) => store.get(id));
  const put = (record) => withStore("readwrite", (store) => store.put(record));
  const remove = (id) => withStore("readwrite", (store) => store.delete(id));

  return {
    DB_NAME,
    DB_VERSION,
    STORE_NAME,
    requestToPromise,
    transactionToPromise,
    open,
    list,
    get,
    put,
    remove,
    DRAFT_LANGUAGE_FALLBACK,
    getDraft: async () => {
      const draft = await withStore("readonly", (store) => store.get("current"), "drafts");
      // No draft is not an empty draft: the caller has to be able to tell.
      return draft ? { ...draft, language: draftLanguage(draft.language) } : draft;
    },
    putDraft: (invitation, language) => withStore("readwrite", (store) => store.put({
      id: "current",
      invitation,
      language: draftLanguage(language),
      updatedAt: new Date().toISOString()
    }), "drafts")
  };
});
