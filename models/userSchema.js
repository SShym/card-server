const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
  googleId: { type: String },
  avatar: { type: String },
  name: { type: String },
  email: { type: String },
});

module.exports = mongoose.model("Card-User", userSchema);