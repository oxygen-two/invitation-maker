const { MongoClient } = require("mongodb");

const errorWithCode = (code) => Object.assign(new Error(code), { code });

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const LIST_PROJECTION = Object.freeze({
  id: 1,
  "invitation.title": 1,
  createdAt: 1,
  expiresAt: 1
});

const titleOf = (record) => (
  typeof record.invitation?.title === "string" && record.invitation.title.trim()
    ? record.invitation.title.trim()
    : "(제목 없음)"
);

const toListItem = (record) => ({
  id: record.id,
  title: titleOf(record),
  createdAt: record.createdAt?.toISOString?.() || record.createdAt || null,
  expiresAt: record.expiresAt || null,
  publicPath: `/i/${record.id}`
});

const toAdminRecord = (record) => ({
  id: record.id,
  invitation: record.invitation,
  title: titleOf(record),
  createdAt: record.createdAt?.toISOString?.() || record.createdAt || null,
  expiresAt: record.expiresAt || null,
  publicPath: `/i/${record.id}`
});

const createAdminMongoPublications = ({
  uri,
  dbName,
  collectionName = "published_invitations",
  collectionFactory
} = {}) => {
  let client = null;
  let setupPromise = null;

  const connect = async () => {
    if (!uri || !dbName) throw errorWithCode("REPOSITORY_UNAVAILABLE");
    if (!client) client = new MongoClient(uri);
    await client.connect();
    return client.db(dbName);
  };

  const setupIndexes = async () => {
    const db = await connect();
    const col = db.collection(collectionName);
    await Promise.all([
      col.createIndex({ id: 1 }, { unique: true }),
      col.createIndex({ createdAt: -1, _id: -1 }),
      col.createIndex({ "invitation.title": 1 })
    ]);
    return col;
  };

  const collection = async () => {
    if (collectionFactory) return collectionFactory();
    if (!setupPromise) {
      setupPromise = setupIndexes().catch((error) => {
        setupPromise = null;
        throw error;
      });
    }
    return setupPromise;
  };

  const list = async ({ page = 1, pageSize = 20, query = "" } = {}) => {
    const normalizedPageSize = Math.min(100, Math.max(1, Number.parseInt(pageSize, 10) || 20));
    const requestedPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const search = String(query || "").trim();
    const escapedSearch = escapeRegex(search);
    const filter = search ? {
      $or: [
        { id: { $regex: escapedSearch, $options: "i" } },
        { "invitation.title": { $regex: escapedSearch, $options: "i" } }
      ]
    } : {};

    const invitations = await collection();
    const totalItems = await invitations.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / normalizedPageSize);
    const normalizedPage = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1;

    const records = await invitations.find(filter, { projection: LIST_PROJECTION })
      .sort({ createdAt: -1, _id: -1, id: 1 })
      .skip((normalizedPage - 1) * normalizedPageSize)
      .limit(normalizedPageSize)
      .toArray();

    return {
      items: records.map(toListItem),
      pagination: {
        page: normalizedPage,
        pageSize: normalizedPageSize,
        totalItems,
        totalPages
      }
    };
  };

  // Deliberately unfiltered by expiry, unlike the public read: nothing deletes
  // expired publications any more, so an operator must still be able to see and
  // revoke one. Admin reads never write, so this cannot revive anything.
  const getAdmin = async (id) => {
    const record = await (await collection()).findOne({ id });
    return record ? toAdminRecord(record) : null;
  };

  const revoke = async (id) => {
    const result = await (await collection()).deleteOne({ id });
    return result.deletedCount === 1;
  };

  const close = async () => {
    if (client) await client.close();
    client = null;
    setupPromise = null;
  };

  return {
    list,
    getAdmin,
    revoke,
    close
  };
};

module.exports = {
  createAdminMongoPublications
};
