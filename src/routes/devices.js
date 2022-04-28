const express = require('express')
const ethers = require("ethers")
const { BadRequest, NotFound ,Forbidden} = require("../utils/errors")
var bodyParser = require('body-parser')
const storage = require('node-persist');
const generate = require('generate-api-key');
const CryptoJS = require('crypto-js');
const iota = require("./iota-helper")
const ethereum = require("./ethereum-config.js")

const ethereum_name = "ethereum"
const iota_name = "iota"
const cosmos_name = "cosmos"


async function check_iota_index(){
  await storage.init()
  try{
    if(await storage.getItem("iota-index-channel") == undefined){
      let channel=await iota.create_index_channel('eReuse-test-index-' + Math.ceil(Math.random() * 100000))
      await storage.setItem("iota-index-channel", channel)
    }
  } catch(e){
    console.log("WARNING: Couldn't create iota index channel!")
  }
}
check_iota_index()



const characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

const app = express()
app.use(bodyParser.json())
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
)

var nonce

ethereum.signer.getTransactionCount().then(n => {
  nonce = n
})

app.get('/', (req, res) => {
  res.send('BESU API')
})

async function chid_to_deviceAdress(chid){
  var response =  await ethereum.defaultDeviceFactoryContract.getAddressFromChid(chid)
  return response
}

function is_device_address_valid(deviceAddress){
  return !(deviceAddress == "0x0000000000000000000000000000000000000000")
                           //0x0000000000000000000000000000000000000000
}

function generate_token() {
  const prefix = generate({ length: 15, pool: characters })
  const token = generate({ length: 64, pool: characters, prefix: prefix })
  const salt = generate({ length: 64, pool: characters })

  var split_token = token.split(".");

  const hash = CryptoJS.SHA3(split_token[1] + salt, { outputLength: 256 }).toString(CryptoJS.enc.Hex);

  return {prefix:prefix, token:token, salt: salt, hash: hash }
}

async function check_token(token) {
  if (token == undefined) return false
  var split_token = token.split(".");
  const item = await storage.getItem(split_token[0]);

  if(item == undefined) return false

  const hash = CryptoJS.SHA3(split_token[1] + item.salt, { outputLength: 256 }).toString(CryptoJS.enc.Hex)
  return hash == item.hash
}

async function delete_token(token){
  const valid_token = await check_token(token)
  if(!valid_token) return false
  var split_token = token.split(".");
  const result = await storage.removeItem(split_token[0])

  return result.removed
  
}

async function get_wallet(token) {
  var split_token = token.split(".");
  const item = await storage.getItem(split_token[0]);

  //skip check for undefined as this should only be called after checking the token validity
  const wallet = new ethers.Wallet(item.eth_priv_key, ethereum.provider)
  return wallet
}

async function get_iota_id(token) {
  var split_token = token.split(".");
  const item = await storage.getItem(split_token[0]);

  //skip check for undefined as this should only be called after checking the token validity
  return item.iota_id
}

function createContract(address, contractPath, wallet){
  const contract = new ethers.Contract(
    address,
    require(contractPath).abi,
    wallet
  )
  return contract
}

function getEvents(txReceipt, event, interface) {
  var args;
  txReceipt.events.forEach(log => {
    if (log.event == event){
      args = interface.parseLog(log).args
    }
  })
  return args;
}

function printNonce(n){
  console.log(`Nonce: ${n}`)
}

function get_error_object(error){
  switch (error){
    case "Device already exists.":
      return {code:406, message:error}
    case "CHID not registered.":
      return {code:406, message:error}
    case "Incorrect DPP format.":
      return {code:406, message:error}
    case "Couldn't register the user.":
      return {code:500, message:error}
    case "Invalid API token.":
      return {code:500, message:error}
    case "Couldn't invalidate the user.":
      return {code:500, message:error}
  }
  return {code:500, message:"Blockchain service error."}
}

function get_dlt(req){
  return req.headers.dlt.replace(/\s+/g, '').split(',')
}

app.post("/registerUser", async (req, res, next) => {
  var dlt = get_dlt(req)
  const privateKey = req.body.privateKey ?? ""
  var wallet
  try{
    console.log(`Called /registerUser`)
    const token_object = generate_token()
    if (privateKey == "") {
      wallet = ethers.Wallet.createRandom()
    }
    else{
      wallet = new ethers.Wallet(privateKey, ethereum.provider)
    }

    //Creation of IOTA identity.
    //TODO: check if it's provided in request.
    var iota_id = await iota.create_identity()

    await storage.setItem(token_object.prefix, {salt: token_object.salt, hash: token_object.hash, eth_priv_key: wallet.privateKey, iota_id: iota_id})
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
  catch (e){
    const error_object = get_error_object("Couldn't register the user.")
    res.status(error_object.code);
    res.json({
      status: error_object.message,
    })
    next(e)
  }

})


app.post("/invalidateUser", async (req, res, next) => {
  const api_token = req.body.api_token;
  try{
    console.log(`Called /invalidateUser`)
    const deleted = await delete_token(api_token)
    if (!deleted) throw new BadRequest("Invalid API token.")
    res.json({
      status: "Success.",
      data: {
        deleted_token: api_token
      }
    })
  }
  catch (e){
    const error_object = get_error_object("Couldn't invalidate the user.")
    res.status(error_object.code);
    res.json({
      status: error_object.message,
    })
    next(e)
  }

})

class Parameters {
  constructor(req) {
    this.api_token = req.body.api_token ?? "";
    this.deviceCHID = req.body.DeviceCHID ?? "";
    this.deviceDPP = req.body.DeviceDPP ?? "";
    this.documentID = req.body.DocumentID ?? "";
    this.documentSignature = req.body.DocumentSignature ?? "";
    this.issuerID = req.body.IssuerID ?? "";
    this.type = req.body.Type ?? "";
    this.dlt = req.headers.dlt.replace(/\s+/g, '').split(',')
  }
}


app.post("/registerDevice", async (req, res, next) => {
  const parameters = new Parameters(req)

  var response_data ={}
  var n_errors = 0
  try{
    console.log(`Called /registerDevice with chid: ${parameters.deviceCHID}`)

    const valid_token = await check_token(parameters.api_token)
    if(!valid_token) throw new BadRequest("Invalid API token.")

    if (parameters.dlt.includes(iota_name)) {
      try {
        const iota_id = await get_iota_id(parameters.api_token)

        if ((await iota.lookup_device_channel(parameters.deviceCHID) != false) || parameters.deviceCHID == "") {
          throw new BadRequest("Device already exists.")
        }

        var iota_creation_response = await iota.create_device_channel(iota_id, parameters.deviceCHID)

        response_data.iota = {
          channelAddress: iota_creation_response.retChannel,
          timestamp: iota_creation_response.timestamp
        }
      } catch(e){
        console.log(e)
        n_errors++
        console.log("IOTA ERROR")
        const error_object = get_error_object(e.message)
        response_data.iota = {
          error: error_object.message
        }
      }
    }

    if (parameters.dlt.includes(ethereum_name)) {
      try {
        const wallet = await get_wallet(parameters.api_token)
        var existingDeviceAddress = await chid_to_deviceAdress(parameters.deviceCHID)
        if (is_device_address_valid(existingDeviceAddress) || parameters.deviceCHID == "") {
          throw new BadRequest("Device already exists.")
        }

        const deviceFactoryContract = createContract(ethereum.DEVICEFACTORY_ADDRESS, "../../build/contracts/DeviceFactory.json", wallet)
        var txResponse = await deviceFactoryContract.registerDevice(parameters.deviceCHID, { gasLimit: 6721975 })
        var txReceipt = await txResponse.wait()
        var args = getEvents(txReceipt, 'DeviceRegistered', ethereum.deviceFactoryIface)

        response_data.ethereum = {
          deviceAddress: args._deviceAddress,
          timestamp: parseInt(Number(args.timestamp), 10)
        }
      } catch (e) {
        n_errors++
        console.log("ETHEREUM ERROR")
        const error_object = get_error_object(e.message)
        //console.log(e.message)
        response_data.iota = {
          error: error_object.message
        }
      }
    }
    
    res.status(201);
    if(n_errors>0){
      res.status(500)
    }
    res.json({
      data: response_data
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

app.post("/deRegisterDevice", async (req, res, next) => {
  const parameters = new Parameters(req)

  try{
    console.log(`Called /deRegisterDevice with chid: ${parameters.deviceCHID}`)

    const valid_token = await check_token(parameters.api_token)
    if(!valid_token) throw new BadRequest("Invalid API token.")
    const wallet = await get_wallet(parameters.api_token)

    var deviceAddress = await chid_to_deviceAdress(parameters.deviceCHID)

    if (!is_device_address_valid(deviceAddress)) {
      throw new BadRequest("CHID not registered.")
    }
    
    const depositDeviceContract = createContract(deviceAddress,"../../build/contracts/DepositDevice.json", wallet)

    var txResponse = await depositDeviceContract.deRegisterDevice(parameters.deviceCHID, {gasLimit:6721975})
    var txReceipt = await txResponse.wait()

    var args = getEvents(txReceipt, 'deRegisterProof',ethereum.depositDeviceIface)

    res.status(201);
    res.json({
      status: "Success",
      data: {
        timestamp: parseInt(Number(args.timestamp),10)
      },
    })
  }
  catch (e) {
    const error_object = get_error_object(e.message)
    res.status(error_object.code);
    res.json({
      status: error_object.message,
    })
    next(e)
  }
})

app.post("/issuePassport", async (req, res, next) => {
  const parameters = new Parameters(req)
  var response_data={}
  var n_errors=0
  
  try{
    console.log(`Called /issuePassport with DPP: ${parameters.deviceDPP}`)

    const valid_token = await check_token(parameters.api_token)
    if(!valid_token) throw new BadRequest("Invalid API token.")

    var splitDeviceDPP = parameters.deviceDPP.split(":");
    const deviceCHID = splitDeviceDPP[0];
    const devicePHID = splitDeviceDPP[1];

    if (devicePHID == "" || splitDeviceDPP.length <2)  {
      throw new BadRequest("Incorrect DPP format.")
    }


    if (parameters.dlt.includes(iota_name)) {
      try {
        const iota_id = await get_iota_id(parameters.api_token)

        if ((await iota.lookup_device_channel(deviceCHID) == false)) {
          throw new BadRequest("CHID not registered.")
        }

        var iota_timestamp = await iota.write_device_channel(iota_id, deviceCHID, "proof_of_issue", {
          DeviceDPP: `${deviceCHID}:${devicePHID}`,
          IssuerID: parameters.issuerID,
          DocumentID: parameters.documentID,
          DocumentSignature: parameters.documentSignature
        })

        response_data.iota = {
          timestamp: iota_timestamp
        }
      } catch (e) {
        console.log(e)
        n_errors++
        console.log("IOTA ERROR")
        const error_object = get_error_object(e.message)
        response_data.iota = {
          error: error_object.message
        }
      }
    }

    if (parameters.dlt.includes(ethereum_name)) {
      try {
        const wallet = await get_wallet(parameters.api_token)

        var deviceAddress = await chid_to_deviceAdress(deviceCHID)

        if (!is_device_address_valid(deviceAddress)) {
          throw new BadRequest("CHID not registered.")
        }

        const depositDeviceContract = createContract(deviceAddress, "../../build/contracts/DepositDevice.json", wallet)

        const txResponse = await depositDeviceContract.issuePassport(deviceCHID, devicePHID, parameters.documentID, parameters.documentSignature, parameters.issuerID, { gasLimit: 6721975 })
        const txReceipt = await txResponse.wait()
        var args = getEvents(txReceipt, 'issueProof', ethereum.depositDeviceIface)

        response_data.ethereum = {
          timestamp: parseInt(Number(args.timestamp), 10)
        }
      } catch (e) {
        n_errors++
        console.log("ETHEREUM ERROR")
        const error_object = get_error_object(e.message)
        response_data.iota = {
          error: error_object.message
        }
      }
    }


    res.status(201);
    if(n_errors>0){
      res.status(500)
    }
    res.json({
      data: response_data
    })

  }
  catch (e) {
    const error_object = get_error_object(e.message)
    res.status(error_object.code);
    res.json({
      status: error_object.message,
    })
    next(e)
  }
})

app.post("/generateProof", async (req, res, next) => {
  const parameters = new Parameters(req)
  var response_data={}
  var n_errors=0

  try{
    console.log(`Called /generateProof with chid: ${parameters.deviceCHID}`)

    const valid_token = await check_token(parameters.api_token)
    if(!valid_token) throw new BadRequest("Invalid API token.")

    if (parameters.dlt.includes(iota_name)) {
      try {
        const iota_id = await get_iota_id(parameters.api_token)

        if ((await iota.lookup_device_channel(parameters.deviceCHID) == false)) {
          throw new BadRequest("CHID not registered.")
        }

        var iota_timestamp = await iota.write_device_channel(iota_id, parameters.deviceCHID, "generic_proof", {
          IssuerID: parameters.issuerID,
          DocumentID: parameters.documentID,
          DocumentSignature: parameters.documentSignature,
          DocumentType: parameters.type
        })

        response_data.iota = {
          timestamp: iota_timestamp
        }
      } catch (e) {
        console.log(e)
        n_errors++
        console.log("IOTA ERROR")
        const error_object = get_error_object(e.message)
        response_data.iota = {
          error: error_object.message
        }
      }
    }


    if (parameters.dlt.includes(ethereum_name)) {
      try {
        const wallet = await get_wallet(parameters.api_token)

        var deviceAddress = await chid_to_deviceAdress(parameters.deviceCHID)
        if (!is_device_address_valid(deviceAddress)) {
          throw new BadRequest("CHID not registered.")
        }

        const depositDeviceContract = createContract(deviceAddress, "../../build/contracts/DepositDevice.json", wallet)

        const txResponse = await depositDeviceContract.generateGenericProof(parameters.deviceCHID, parameters.issuerID, parameters.documentID, parameters.documentSignature, parameters.type, { gasLimit: 6721975 })
        const txReceipt = await txResponse.wait()
        var args = getEvents(txReceipt, 'genericProof', ethereum.depositDeviceIface)

        response_data.ethereum = {
          timestamp: parseInt(Number(args.timestamp), 10)
        }
      } catch (e) {
        n_errors++
        console.log("ETHEREUM ERROR")
        const error_object = get_error_object(e.message)
        response_data.iota = {
          error: error_object.message
        }
      }
    }

    res.status(201);
    if(n_errors>0){
      res.status(500)
    }
    res.json({
      data: response_data
    })

  }
  catch (e) {
    const error_object = get_error_object(e.message)
    res.status(error_object.code);
    res.json({
      status: error_object.message,
    })
    next(e)
  }
})

app.post("/getProofs", async (req, res, next) => {
  const parameters = new Parameters(req)

  var response_data={}
  var n_errors = 0

  try{
    console.log(`Called /getProofs with chid: ${parameters.deviceCHID}`)

    const valid_token = await check_token(parameters.api_token)
    if(!valid_token) throw new BadRequest("Invalid API token.")

    if (parameters.dlt.includes(iota_name)) {
      try {
        const iota_id = await get_iota_id(parameters.api_token)

        if ((await iota.lookup_device_channel(parameters.deviceCHID) == false)) {
          throw new BadRequest("CHID not registered.")
        }

        var iota_proofs = await iota.read_device_generic_proofs(iota_id, parameters.deviceCHID)

        response_data.iota = iota_proofs
      } catch (e) {
        console.log(e)
        n_errors++
        console.log("IOTA ERROR")
        const error_object = get_error_object(e.message)
        response_data.iota = {
          error: error_object.message
        }
      }
    }

    if (parameters.dlt.includes(ethereum_name)) {
      try {
        const wallet = await get_wallet(parameters.api_token)

        var deviceAddress = await chid_to_deviceAdress(parameters.deviceCHID)
        if (!is_device_address_valid(deviceAddress)) {
          throw new BadRequest("CHID not registered.")
        }

        const depositDeviceContract = createContract(deviceAddress, "../../build/contracts/DepositDevice.json", wallet)

        const value = await depositDeviceContract.getGenericProofs();
        var data = []
        if (value.length != 0) {
          value.forEach(elem => {
            let proof_data = {
              IssuerID: elem[1],
              DocumentID: elem[2],
              DocumentSignature: elem[3],
              DocumentType: elem[4],
              timestamp: parseInt(Number(elem[5]), 10),
              blockNumber: parseInt(Number(elem[6]), 10),
            }
            data.push(proof_data)
          })
        }
        response_data.ethereum = data
      } catch (e) {
        n_errors++
        console.log("ETHEREUM ERROR")
        const error_object = get_error_object(e.message)
        response_data.iota = {
          error: error_object.message
        }
      }
    }

    if(n_errors>0){
      res.status(500)
    }
    res.json({
      data: response_data,
    })
  }
  catch (e) {
    const error_object = get_error_object(e.message)
    res.status(error_object.code);
    res.json({
      status: error_object.message,
    })
    next(e)
  }
})

app.post("/getIssueProofs", async (req, res, next) => {
  const parameters = new Parameters(req)

  var response_data={}
  var n_errors = 0

  try{
    console.log(`Called /getIssueProofs with chid: ${parameters.deviceCHID}`)

    const valid_token = await check_token(parameters.api_token)
    if(!valid_token) throw new BadRequest("Invalid API token.")

    if (parameters.dlt.includes(iota_name)) {
      try {
        const iota_id = await get_iota_id(parameters.api_token)

        if ((await iota.lookup_device_channel(parameters.deviceCHID) == false)) {
          throw new BadRequest("CHID not registered.")
        }

        var iota_proofs = await iota.read_device_proofs_of_issue(iota_id, parameters.deviceCHID)

        response_data.iota = iota_proofs
      } catch (e) {
        console.log(e)
        n_errors++
        console.log("IOTA ERROR")
        const error_object = get_error_object(e.message)
        response_data.iota = {
          error: error_object.message
        }
      }
    }


    if (parameters.dlt.includes(ethereum_name)) {
      try {
        const wallet = await get_wallet(parameters.api_token)

        var deviceAddress = await chid_to_deviceAdress(parameters.deviceCHID)
        if (!is_device_address_valid(deviceAddress)) {
          throw new BadRequest("CHID not registered.")
        }

        const depositDeviceContract = createContract(deviceAddress, "../../build/contracts/DepositDevice.json", wallet)

        const value = await depositDeviceContract.getIssueProofs();
        var data = []
        if (value.length != 0) {
          value.forEach(elem => {
            let proof_data = {
              DeviceDPP: `${elem[0]}:${elem[1]}`,
              IssuerID: elem[4],
              DocumentID: elem[2],
              DocumentSignature: elem[3],
              timestamp: parseInt(Number(elem[5]), 10),
              blockNumber: parseInt(Number(elem[6]), 10),
            }
            data.push(proof_data)
          })
        }

        response_data.ethereum = data
      } catch (e) {
        n_errors++
        console.log("ETHEREUM ERROR")
        const error_object = get_error_object(e.message)
        response_data.iota = {
          error: error_object.message
        }
      }
    }

    if(n_errors>0){
      res.status(500)
    }
    res.json({
      data: response_data,
    })
  }
  catch (e) {
    const error_object = get_error_object(e.message)
    res.status(error_object.code);
    res.json({
      status: error_object.message,
    })
    next(e)
  }
})

app.post("/getRegisterProofsByCHID", async (req, res, next) => {
  const parameters = new Parameters(req)

  var response_data={}
  var n_errors = 0

  try{
    console.log(`Called /getRegisterProofsByCHID with chid: ${parameters.deviceCHID}`)

    const valid_token = await check_token(parameters.api_token)
    if(!valid_token) throw new BadRequest("Invalid API token.")

    if (parameters.dlt.includes(iota_name)) {
      try {
        const iota_id = await get_iota_id(parameters.api_token)

        if ((await iota.lookup_device_channel(parameters.deviceCHID) == false)) {
          throw new BadRequest("CHID not registered.")
        }

        var iota_proofs = await iota.read_device_proofs_of_register(iota_id, parameters.deviceCHID)

        response_data.iota = iota_proofs
      } catch (e) {
        console.log(e)
        n_errors++
        console.log("IOTA ERROR")
        const error_object = get_error_object(e.message)
        response_data.iota = {
          error: error_object.message
        }
      }
    }

    if (parameters.dlt.includes(ethereum_name)) {
      try {
        const wallet = await get_wallet(parameters.api_token)

        var deviceAddress = await chid_to_deviceAdress(parameters.deviceCHID)
        if (!is_device_address_valid(deviceAddress)) {
          throw new BadRequest("CHID not registered.")
        }

        const depositDeviceContract = createContract(deviceAddress, "../../build/contracts/DepositDevice.json", wallet)

        const value = await depositDeviceContract.getRegisterProofs();
        var data = []
        if (value.length != 0) {
          value.forEach(elem => {
            let proof_data = {
              //DeviceCHID: elem[0], //FIX
              timestamp: parseInt(Number(elem[1]), 10),
              blockNumber: parseInt(Number(elem[2]), 10),
            }
            data.push(proof_data)
          })
        }

        response_data.ethereum = data
      } catch (e) {
        n_errors++
        console.log("ETHEREUM ERROR")
        const error_object = get_error_object(e.message)
        response_data.iota = {
          error: error_object.message
        }
      }
    }

    if(n_errors>0){
      res.status(500)
    }
    res.json({
      data: response_data,
    })
  }
  catch (e) {
    const error_object = get_error_object(e.message)
    res.status(error_object.code);
    res.json({
      status: error_object.message,
    })
    next(e)
  }
})


app.post("/getDeRegisterProofs", async (req, res, next) => {
  const parameters = new Parameters(req)

  try{
    console.log(`Called /getDeRegisterProofs with chid: ${parameters.deviceCHID}`)

    const valid_token = await check_token(parameters.api_token)
    if(!valid_token) throw new BadRequest("Invalid API token.")
    const wallet = await get_wallet(parameters.api_token)

    var deviceAddress = await chid_to_deviceAdress(parameters.deviceCHID)
    if (!is_device_address_valid(deviceAddress)) {
      throw new BadRequest("CHID not registered.")
    }

    const depositDeviceContract = createContract(deviceAddress,"../../build/contracts/DepositDevice.json", wallet)

    const value = await depositDeviceContract.getDeRegisterProofs();
    var data = []
    if (value.length != 0) {
      value.forEach(elem => {
        let proof_data = {
          DeviceCHID: elem[0],
          timestamp: parseInt(Number(elem[1]), 10),
          blockNumber: parseInt(Number(elem[2]), 10),
        }
        data.push(proof_data)
      })
    }

    res.json({
      status: "Success",
      data: data,
    })
  }
  catch (e) {
    const error_object = get_error_object(e.message)
    res.status(error_object.code);
    res.json({
      status: error_object.message,
    })
    next(e)
  }
})

app.listen(ethereum.port, ethereum.host, () => {
  console.log(`Example app listening at http://${ethereum.host}:${ethereum.port}`)
})

module.exports = app
