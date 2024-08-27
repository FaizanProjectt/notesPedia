const Joi = require("joi");

const noteJoiSchema = Joi.object({
  title: Joi.string().required(),
  owner: Joi.string().required(),
  desc: Joi.string().required(),
  fileUrl: Joi.object({
    url: Joi.string().uri().required(),
    filename: Joi.string().required(),
  }).optional(),
});

const userJoiSchema = Joi.object({
  username: Joi.string().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

module.exports = { userJoiSchema };
module.exports = { noteJoiSchema };
