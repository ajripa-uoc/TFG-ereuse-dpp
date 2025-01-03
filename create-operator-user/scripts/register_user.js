// payload = {
//     'privateKey' : privateKey
// }
// res = requests.post(endpoint + "/registerUser", data=payload)
// return res.json()

const axios = require("axios")
//const api_url = "http://api_connector:3010"
const api_url = process.env.API_CONNECTOR_URL || "http://api_connector:3010";
const route = "registerUser"
const params= {
    privateKey:"b1a456156a846f256783b90af3da3317f05297909ba56be6faed916f1f281611"
}

const dlt = "ethereum"
axios.post(`${api_url}/${route}`, params, {
    headers: {
        dlt: dlt
    }
}).then(response => {
    // DEBUG
    //console.error(response)
    // returns api_token for the register user-operator
    console.log(response.data.data.api_token)
}

)
