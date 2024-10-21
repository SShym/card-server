const express = require('express');
const Router = express();
const userSchema = require('../models/userSchema');

Router.post('/auth',  async (req, res) => {
    const { email, googleId, imageUrl, name } = req.body;
  
    try {
      const oldUser = await userSchema.findOne({ googleId });
    
      if (oldUser){
        res.status(200).json(oldUser);
      } else {
        await userSchema.create({ 
            googleId,
            email: email,
            name,
            avatar: imageUrl
        }).then((result) => {
            res.json(result);
        });
      }
    } catch (error) {
      res.status(500).json({ message: "Something went wrong" });
    }
});

module.exports = Router;
