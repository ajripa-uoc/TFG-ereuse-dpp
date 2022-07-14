const express = require('express'),
router = express.Router();

const { BadRequest, NotFound, Forbidden } = require("../utils/errors")
const storage = require('node-persist');
const ethers = require("ethers")
const iota = require("../utils/iota/iota-helper.js")
const multiacc = require("../utils/multiacc-helper.js");
const ethereum = require("../utils/ethereum/ethereum-config.js")
const ethHelper = require("../utils/ethereum/ethereum-helper.js")



const app = express()

function get_error_object(error) {
    switch (error) {
      case "Device already exists.":
        return { code: 406, message: error }
      case "CHID not registered.":
        return { code: 406, message: error }
      case "Incorrect DPP format.":
        return { code: 406, message: error }
      case "Couldn't register the user.":
        return { code: 500, message: error }
      case "Invalid API token.":
        return { code: 500, message: error }
      case "Couldn't invalidate the user.":
        return { code: 500, message: error }
    }
    return { code: 500, message: "Blockchain service error." }
  }

router

.post("/registerUser", async (req, res, next) => {
    const privateKey = req.body.privateKey ?? ""
    var wallet
    try {
      console.log(`Called /registerUser`)
      const token_object = multiacc.generate_token()
      if (privateKey == "") {
        wallet = ethers.Wallet.createRandom()
      }
      else {
        wallet = new ethers.Wallet(privateKey, ethereum.provider)
      }

      //Creation of IOTA identity.
      //TODO: check if it's provided in request.
      var iota_id = await iota.create_identity()

      await storage.setItem(token_object.prefix, { salt: token_object.salt, hash: token_object.hash, eth_priv_key: wallet.privateKey, iota_id: iota_id, iota: {credentials:{}}})
      res.json({
        status: "Success.",
        data: {
          api_token: token_object.token,
          eth_pub_key: wallet.address,
          eth_priv_key: wallet.privateKey,
          iota_id: iota_id
        }
      })
    }
    catch (e) {
      const error_object = get_error_object("Couldn't register the user.")
      res.status(error_object.code);
      res.json({
        status: error_object.message,
      })
      next(e)
    }
  
  })
  
.post("/invalidateUser", async (req, res, next) => {
    const api_token = req.body.api_token;
    try {
      console.log(`Called /invalidateUser`)
      const deleted = await multiacc.delete_token(api_token)
      if (!deleted) throw new BadRequest("Invalid API token.")
      res.json({
        status: "Success.",
        data: {
          deleted_token: api_token
        }
      })
    }
    catch (e) {
      const error_object = get_error_object("Couldn't invalidate the user.")
      res.status(error_object.code);
      res.json({
        status: error_object.message,
      })
      next(e)
    }
  
})

.post("/checkUserRoles", async (req, res, next) => {
    const api_token = req.body.api_token;
    console.log(`Called /checkUserRoles`)
    try {
      //TODO: check IOTA roles. store output into iota_response_data

      const valid_token = await multiacc.check_token(api_token)
      if (!valid_token) throw new BadRequest("Invalid API token.")

      const wallet = await ethHelper.get_wallet(api_token)
      
      const accessListContract = ethHelper.createContract
      (ethereum.ACCESSLIST_ADDRESS, "../../../build/contracts/AccessList.json", wallet)

      const isIssuer = await accessListContract.checkIfIssuer(wallet.address);
      const isOperator = await accessListContract.checkIfOperator(wallet.address);
      const isWitness = await accessListContract.checkIfWitness(wallet.address);
      const isVerifier = await accessListContract.checkIfVerifier(wallet.address);

      var response_data_eth = {
        isIssuer: isIssuer,
        isOperator: isOperator,
        isWitness: isWitness,
        isVerifier: isVerifier,
      }
      
      res.status(200);
      res.json({
        data: response_data_eth
      })
    }

    catch (e) {
      const error_object = get_error_object(e.message)
      res.status(error_object.code);
      res.json({
        error: error_object.message,
      })
      next(e)
    }
  })

module.exports = router
