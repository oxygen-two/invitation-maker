(function exposeContentOrder(root, factory) {
  const contentOrder = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = contentOrder;
  }

  root.ContentOrder = contentOrder;
})(typeof globalThis === "object" ? globalThis : this, function createContentOrder() {
  const move = (items, fromIndex, toIndex) => {
    const result = Array.isArray(items) ? items.slice() : [];

    if (!Array.isArray(items)
      || !Number.isInteger(fromIndex)
      || !Number.isInteger(toIndex)
      || fromIndex < 0
      || toIndex < 0
      || fromIndex >= items.length
      || toIndex >= items.length
      || fromIndex === toIndex) {
      return result;
    }

    const [item] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, item);
    return result;
  };

  return { move };
});
