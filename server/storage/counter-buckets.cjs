// server/storage/counter-buckets.cjs
// Shared bucket keys for the hourly/daily counters both publishing and the
// assistant's drafting quota keep in the same Mongo collection.
const hourBucket = (date) => date.toISOString().slice(0, 13);
const dayBucket = (date) => date.toISOString().slice(0, 10);

module.exports = { hourBucket, dayBucket };
