const methods = require("./support-addresses.json");

/** @param {{ writeText: (text: string) => void }} clipboard */
function createSupportAddressCopier(clipboard) {
  /** @param {unknown} _event @param {unknown} id */
  return (_event, id) => {
    const method = typeof id === "string" ? methods.find((item) => item.id === id) : undefined;
    if (!method) return false;
    clipboard.writeText(method.address);
    return true;
  };
}

module.exports = { createSupportAddressCopier };
