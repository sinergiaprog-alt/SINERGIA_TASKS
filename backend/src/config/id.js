const crypto = require('crypto');

// IDs cortos, únicos y ordenables por tiempo (suficiente para esta app; no es CUID pero cumple la misma función).
function newId(prefix) {
  const time = Date.now().toString(36);
  const rand = crypto.randomBytes(6).toString('hex');
  return `${prefix}_${time}${rand}`;
}

module.exports = { newId };
