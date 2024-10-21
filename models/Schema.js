const mongoose = require('mongoose');

const Schema = mongoose.Schema({
    creator: String,
})

module.exports = mongoose.model('comments', Schema)