import express from 'express'
import {verify} from './methods.js'
var router = express.Router();

router

.get("/healthz", (req, res) => {
    res.status(200).json({ status: 'healthy' });
})

.post("/verify", async (req, res, next) => {
    var credential = req.body.credential
    var check = await verify(credential)
    res.header("Access-Control-Allow-Origin", "*");
    res.status(200);
    res.json({
      data: check
    })
})

export default router;
