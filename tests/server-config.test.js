const test = require("node:test");
const assert = require("node:assert/strict");
const { describeMongoConnection, hostFromMongoUri, isLoopbackHost } = require("../server/config/connection-info.cjs");

test("hostFromMongoUri extracts the host from mongodb:// URIs without leaking credentials", () => {
  assert.equal(hostFromMongoUri("mongodb://127.0.0.1:27017"), "127.0.0.1:27017");
  assert.equal(hostFromMongoUri("mongodb://user:pass@127.0.0.1:27017/mydb"), "127.0.0.1:27017");
  assert.equal(hostFromMongoUri("mongodb://user:sup3r:secret@localhost:27017"), "localhost:27017");
});

test("hostFromMongoUri extracts the host from mongodb+srv:// URIs without leaking credentials", () => {
  const host = hostFromMongoUri("mongodb+srv://user:pass@example.mongodb.net/mydb?retryWrites=true");
  assert.equal(host, "example.mongodb.net");
  assert.ok(!host.includes("user"));
  assert.ok(!host.includes("pass"));
});

test("hostFromMongoUri handles multi-host replica set strings and returns '' for non-mongo input", () => {
  assert.equal(hostFromMongoUri("mongodb://a:1,b:2,c:3/mydb"), "a:1,b:2,c:3");
  assert.equal(hostFromMongoUri(""), "");
  assert.equal(hostFromMongoUri("not-a-uri"), "");
});

test("isLoopbackHost classifies loopback vs remote hosts", () => {
  assert.equal(isLoopbackHost("127.0.0.1:27017"), true);
  assert.equal(isLoopbackHost("localhost:27017"), true);
  assert.equal(isLoopbackHost("[::1]:27017"), true);
  assert.equal(isLoopbackHost("example.mongodb.net"), false);
  assert.equal(isLoopbackHost("127.0.0.1:27017,example.mongodb.net:27017"), false);
  assert.equal(isLoopbackHost(""), false);
});

test("describeMongoConnection never leaks credentials and reports isLoopback correctly", () => {
  const local = describeMongoConnection("mongodb://127.0.0.1:27017");
  assert.equal(local.host, "127.0.0.1:27017");
  assert.equal(local.isLoopback, true);

  const remote = describeMongoConnection("mongodb+srv://user:pass@example.mongodb.net");
  assert.equal(remote.host, "example.mongodb.net");
  assert.equal(remote.isLoopback, false);
  assert.ok(!remote.host.includes("user"));
  assert.ok(!remote.host.includes("pass"));
});
