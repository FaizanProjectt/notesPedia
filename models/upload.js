const mongoose = require("mongoose");

// Define the Note schema
const noteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    owner: {
      type: String,
      required: true,
    },
    desc: {
      type: String,
      required: true,
    },
    fileUrl: {
      url: String,
      filename: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Note", noteSchema);
